import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import type { DocumentType } from "@/db/schema";
import { analyzeDocument } from "@/lib/ai/analyze-document";
import { checkAnagraphicCoherence } from "@/lib/ai/coherence";
import {
  deriveApplicationStatus,
  evaluateChecklist,
  inferEmploymentType,
} from "@/lib/checklist";
import { FILE_NAME_PREFIX } from "@/lib/config/documents";
import { computePreScoring } from "@/lib/prescoring";
import { getOrCreateClientFolder, uploadFileToDrive } from "@/lib/google/drive";
import { sendApplicationToSecretary } from "@/lib/google/secretary-sender";

export type IncomingFile = {
  buffer: Buffer;
  mimeType: string;
  originalFileName: string;
  clientEmail?: string;
  clientNameHint?: string;
};

const OPEN_STATUSES = ["DOCUMENTI_INCOMPLETI", "COMPLETA_DA_INOLTRARE"] as const;
const PAYSLIP_SLOTS: DocumentType[] = [
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
];

function withResolvedType<
  T extends { documentType: DocumentType; standardizedFileName: string },
>(analysis: T, resolved: DocumentType, originalFileName: string): T {
  if (analysis.documentType === resolved) return analysis;
  const ext = originalFileName.includes(".")
    ? originalFileName.slice(originalFileName.lastIndexOf("."))
    : ".pdf";
  const prefix = FILE_NAME_PREFIX[resolved] ?? "99_Doc";
  // sostituisce solo il prefisso tipo nel nome già standardizzato
  const rest = analysis.standardizedFileName.replace(/^\d+_[^_]+/, prefix);
  return {
    ...analysis,
    documentType: resolved,
    standardizedFileName: rest.includes(".")
      ? rest
      : `${prefix}_${Date.now()}${ext}`,
  };
}

/**
 * Se Gemini classifica una busta già presente, la mette nel primo slot libero.
 * Tipi non-busta già presenti → null (skip).
 */
function resolveDocumentType(
  detected: DocumentType,
  knownTypes: Set<string>,
): DocumentType | null {
  if (detected === "SCONOSCIUTO") return detected;

  if (PAYSLIP_SLOTS.includes(detected)) {
    if (!knownTypes.has(detected)) return detected;
    const free = PAYSLIP_SLOTS.find((slot) => !knownTypes.has(slot));
    return free ?? null;
  }

  if (knownTypes.has(detected)) return null;
  return detected;
}

/**
 * Una sola pratica per cliente (stessa email mittente).
 * 2ª mail con allegati mancanti → riusa quella esistente, anche se già inviata a segreteria.
 * Nuova pratica solo se non esiste nulla per quell'email/CF (o solo pratiche DELIBERATA).
 */
async function findOrCreateApplication(params: {
  fiscalCode?: string | null;
  email?: string;
  clientName: string;
  isTest?: boolean;
}) {
  const email = params.email?.trim().toLowerCase() || null;
  const fiscalCode = params.fiscalCode?.trim().toUpperCase() || null;

  // 1) Pratica aperta con stessa email
  if (email) {
    const [byEmailOpen] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientEmail, email),
          inArray(applications.status, [...OPEN_STATUSES]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byEmailOpen) {
      if (fiscalCode && !byEmailOpen.clientFiscalCode) {
        const [updated] = await db
          .update(applications)
          .set({ clientFiscalCode: fiscalCode, updatedAt: new Date() })
          .where(eq(applications.id, byEmailOpen.id))
          .returning();
        return updated ?? byEmailOpen;
      }
      return byEmailOpen;
    }

    // 2) Qualsiasi pratica recente stessa email (evita doppioni dopo invio segreteria / force)
    const [byEmailAny] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientEmail, email),
          // non riaprire una deliberata chiusa
          inArray(applications.status, [
            ...OPEN_STATUSES,
            "INVIATA_A_SEGRETERIA",
            "INVIATA_IN_BANCA",
            "PERITO_NOMINATO",
          ]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byEmailAny) {
      if (fiscalCode && !byEmailAny.clientFiscalCode) {
        const [updated] = await db
          .update(applications)
          .set({ clientFiscalCode: fiscalCode, updatedAt: new Date() })
          .where(eq(applications.id, byEmailAny.id))
          .returning();
        return updated ?? byEmailAny;
      }
      return byEmailAny;
    }
  }

  // 3) Pratica aperta con stesso CF
  if (fiscalCode) {
    const [byCf] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientFiscalCode, fiscalCode),
          inArray(applications.status, [
            ...OPEN_STATUSES,
            "INVIATA_A_SEGRETERIA",
            "INVIATA_IN_BANCA",
            "PERITO_NOMINATO",
          ]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byCf) return byCf;
  }

  const [created] = await db
    .insert(applications)
    .values({
      clientName: params.clientName,
      clientEmail: email ?? "sconosciuto@email.local",
      clientFiscalCode: fiscalCode,
      status: "DOCUMENTI_INCOMPLETI",
      isTest: params.isTest ?? false,
    })
    .returning();

  return created;
}

/** Crea/riusa pratica da mail con oggetto giusto (anche senza allegati). */
export async function ensureWaitingApplication(params: {
  email: string;
  clientNameHint?: string;
  isTest?: boolean;
}) {
  return findOrCreateApplication({
    email: params.email,
    clientName: params.clientNameHint || params.email.split("@")[0] || "Cliente",
    isTest: params.isTest,
  });
}

/**
 * Se per errore esistono più pratiche con la stessa email, le fonde:
 * tiene quella con più documenti (o la più aggiornata) e sposta i doc delle altre.
 */
export async function mergeDuplicateOpenApplicationsByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const candidates = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.clientEmail, normalized),
        inArray(applications.status, [
          ...OPEN_STATUSES,
          "INVIATA_A_SEGRETERIA",
          "INVIATA_IN_BANCA",
          "PERITO_NOMINATO",
        ]),
      ),
    );

  if (candidates.length <= 1) return candidates[0] ?? null;

  const ranked = await Promise.all(
    candidates.map(async (app) => {
      const docs = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.applicationId, app.id));
      return { app, docCount: docs.length };
    }),
  );
  ranked.sort((a, b) => {
    if (b.docCount !== a.docCount) return b.docCount - a.docCount;
    return (
      new Date(b.app.updatedAt).getTime() - new Date(a.app.updatedAt).getTime()
    );
  });

  const keep = ranked[0].app;
  const dupes = ranked.slice(1).map((r) => r.app);

  for (const dupe of dupes) {
    await db
      .update(documents)
      .set({ applicationId: keep.id })
      .where(eq(documents.applicationId, dupe.id));

    const patch: Partial<typeof applications.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (!keep.clientFiscalCode && dupe.clientFiscalCode) {
      patch.clientFiscalCode = dupe.clientFiscalCode;
    }
    if (keep.clientName === "Cliente" && dupe.clientName !== "Cliente") {
      patch.clientName = dupe.clientName;
    }
    if (!keep.driveFolderId && dupe.driveFolderId) {
      patch.driveFolderId = dupe.driveFolderId;
      patch.driveFolderUrl = dupe.driveFolderUrl;
    }
    if (!keep.sentToSecretaryAt && dupe.sentToSecretaryAt) {
      patch.sentToSecretaryAt = dupe.sentToSecretaryAt;
      patch.status = dupe.status;
    }
    if (Object.keys(patch).length > 1) {
      await db
        .update(applications)
        .set(patch)
        .where(eq(applications.id, keep.id));
    }

    await db.delete(applications).where(eq(applications.id, dupe.id));
  }

  await dedupeApplicationDocuments(keep.id);
  return keep;
}

/** Fusiona tutti i doppioni per email (cleanup one-shot / cron). */
export async function mergeAllDuplicateApplications() {
  const rows = await db
    .select({ email: applications.clientEmail })
    .from(applications);
  const emails = [
    ...new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean)),
  ];
  let mergedGroups = 0;
  for (const email of emails) {
    const before = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.clientEmail, email));
    if (before.length > 1) {
      await mergeDuplicateOpenApplicationsByEmail(email);
      mergedGroups += 1;
    }
  }
  return { emailsChecked: emails.length, mergedGroups };
}

/** Elimina duplicati: stesso file grezzo o stesso tipo documento (tiene il più recente). */
export async function dedupeApplicationDocuments(applicationId: string) {
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId))
    .orderBy(desc(documents.createdAt));

  const seenRaw = new Set<string>();
  const seenType = new Set<string>();
  const toDelete: string[] = [];

  for (const doc of docs) {
    const rawKey = doc.rawFileName.trim().toLowerCase();
    const typeDup =
      doc.documentType !== "SCONOSCIUTO" && seenType.has(doc.documentType);
    const rawDup = seenRaw.has(rawKey);

    if (rawDup || typeDup) {
      toDelete.push(doc.id);
      continue;
    }

    seenRaw.add(rawKey);
    if (doc.documentType !== "SCONOSCIUTO") {
      seenType.add(doc.documentType);
    }
  }

  if (toDelete.length > 0) {
    await db.delete(documents).where(inArray(documents.id, toDelete));
  }

  return toDelete.length;
}

export async function processIncomingFiles(
  files: IncomingFile[],
  options?: { applicationId?: string; isTest?: boolean },
) {
  if (files.length === 0) {
    return { processed: 0, applicationIds: [] as string[], errors: [] as string[] };
  }

  // Se applicationId noto: salta file già presenti (niente Gemini inutile)
  let knownRaw = new Set<string>();
  let knownTypes = new Set<string>();
  if (options?.applicationId) {
    await dedupeApplicationDocuments(options.applicationId);
    const existing = await db
      .select({
        rawFileName: documents.rawFileName,
        documentType: documents.documentType,
      })
      .from(documents)
      .where(eq(documents.applicationId, options.applicationId));
    knownRaw = new Set(existing.map((d) => d.rawFileName.trim().toLowerCase()));
    knownTypes = new Set(
      existing
        .filter((d) => d.documentType !== "SCONOSCIUTO")
        .map((d) => d.documentType),
    );
  }

  const errors: string[] = [];
  const applicationIds = new Set<string>();
  let processed = 0;

  for (const file of files) {
    const rawKey = file.originalFileName.trim().toLowerCase();
    if (knownRaw.has(rawKey)) {
      continue;
    }

    let analysis;
    try {
      analysis = await analyzeDocument({
        buffer: file.buffer,
        mimeType: file.mimeType,
        originalFileName: file.originalFileName,
      });
    } catch (reason) {
      const msg =
        reason instanceof Error ? reason.message : String(reason);
      errors.push(`${file.originalFileName}: ${msg}`);
      console.error("analyze failed", file.originalFileName, msg);
      continue;
    }

    // Se quel tipo c'è già, prova remap buste / altrimenti skip
    if (options?.applicationId) {
      const resolved = resolveDocumentType(analysis.documentType, knownTypes);
      if (!resolved) {
        applicationIds.add(options.applicationId);
        continue;
      }
      analysis = withResolvedType(
        analysis,
        resolved,
        file.originalFileName,
      );
    }

    const clientName =
      [analysis.extractedData.lastName, analysis.extractedData.firstName]
        .filter(Boolean)
        .join(" ") ||
      file.clientNameHint ||
      "Cliente";

    let app;
    if (options?.applicationId) {
      const [existing] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, options.applicationId))
        .limit(1);
      app = existing;
    }

    if (!app) {
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const isTest =
        options?.isTest === true ||
        Boolean(
          adminEmail &&
            file.clientEmail?.toLowerCase() === adminEmail,
        );

      if (file.clientEmail) {
        await mergeDuplicateOpenApplicationsByEmail(file.clientEmail);
      }

      app = await findOrCreateApplication({
        fiscalCode: analysis.extractedData.fiscalCode,
        email: file.clientEmail,
        clientName,
        isTest,
      });

      // Dopo aver trovato la pratica, ricarica i già presenti
      await dedupeApplicationDocuments(app.id);
      const existing = await db
        .select({
          rawFileName: documents.rawFileName,
          documentType: documents.documentType,
        })
        .from(documents)
        .where(eq(documents.applicationId, app.id));
      knownRaw = new Set(
        existing.map((d) => d.rawFileName.trim().toLowerCase()),
      );
      knownTypes = new Set(
        existing
          .filter((d) => d.documentType !== "SCONOSCIUTO")
          .map((d) => d.documentType),
      );

      if (knownRaw.has(rawKey)) {
        applicationIds.add(app.id);
        continue;
      }

      const resolved = resolveDocumentType(analysis.documentType, knownTypes);
      if (!resolved) {
        applicationIds.add(app.id);
        continue;
      }
      analysis = withResolvedType(
        analysis,
        resolved,
        file.originalFileName,
      );
    }

    const updates: Partial<typeof applications.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (!app.clientFiscalCode && analysis.extractedData.fiscalCode) {
      updates.clientFiscalCode = analysis.extractedData.fiscalCode.toUpperCase();
    }
    if (app.clientName === "Cliente" && clientName !== "Cliente") {
      updates.clientName = clientName;
    }
    if (Object.keys(updates).length > 1) {
      await db
        .update(applications)
        .set(updates)
        .where(eq(applications.id, app.id));
      app = { ...app, ...updates } as typeof app;
    }

    let folderId = app.driveFolderId;
    let folderUrl = app.driveFolderUrl;
    if (!folderId) {
      const folder = await getOrCreateClientFolder(app.clientName, app.id);
      folderId = folder.folderId;
      folderUrl = folder.folderUrl;
      await db
        .update(applications)
        .set({
          driveFolderId: folderId,
          driveFolderUrl: folderUrl,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));
    }

    let driveFileId: string | null = null;
    let driveFileUrl: string | null = null;
    try {
      const uploaded = await uploadFileToDrive({
        folderId: folderId!,
        fileName: analysis.standardizedFileName,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });
      driveFileId = uploaded.driveFileId;
      driveFileUrl = uploaded.driveFileUrl;
    } catch (err) {
      console.error("Drive upload failed", err);
    }

    await db.insert(documents).values({
      applicationId: app.id,
      rawFileName: file.originalFileName,
      renamedFileName: analysis.standardizedFileName,
      documentType: analysis.documentType,
      driveFileId,
      driveFileUrl,
      isValid: analysis.isValid,
      extractedData: analysis.extractedData,
      validationIssues: analysis.validationIssues,
    });

    knownRaw.add(rawKey);
    if (analysis.documentType !== "SCONOSCIUTO") {
      knownTypes.add(analysis.documentType);
    }
    processed += 1;
    applicationIds.add(app.id);
  }

  for (const applicationId of applicationIds) {
    await refreshApplicationState(applicationId);
  }

  return {
    processed,
    applicationIds: [...applicationIds],
    errors,
  };
}

export async function refreshApplicationState(applicationId: string) {
  await dedupeApplicationDocuments(applicationId);

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return;

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  const employmentType = inferEmploymentType(docs);
  const coherenceIssues = checkAnagraphicCoherence(docs);
  const preScoring = computePreScoring(docs);
  if (coherenceIssues.length) {
    preScoring.notes = [...(preScoring.notes ?? []), ...coherenceIssues];
  }

  let nextStatus = deriveApplicationStatus(
    employmentType,
    docs,
    app.status,
  );

  if (coherenceIssues.length && nextStatus === "COMPLETA_DA_INOLTRARE") {
    nextStatus = "DOCUMENTI_INCOMPLETI";
  }

  await db
    .update(applications)
    .set({
      employmentType,
      preScoringData: preScoring,
      ...(nextStatus ? { status: nextStatus } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  const checklist = evaluateChecklist(employmentType, docs);
  if (checklist.isComplete && !coherenceIssues.length) {
    const [settings] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, "global"))
      .limit(1);

    const autoSend = settings?.autoSendToSecretary ?? true;
    const alreadySent = Boolean(app.sentToSecretaryAt);

    if (autoSend && !alreadySent) {
      try {
        await sendApplicationToSecretary(applicationId);
      } catch (err) {
        console.error("auto send secretary failed", err);
      }
    }
  }
}
