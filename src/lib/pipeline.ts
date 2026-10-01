import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import { analyzeDocument } from "@/lib/ai/analyze-document";
import { checkAnagraphicCoherence } from "@/lib/ai/coherence";
import {
  deriveApplicationStatus,
  evaluateChecklist,
  inferEmploymentType,
} from "@/lib/checklist";
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

/**
 * Una sola pratica aperta per cliente.
 * Stessa email (anche 2ª mail con stessi oggetti/allegati mancanti) → riusa quella esistente.
 * Match anche per CF se già noto.
 */
async function findOrCreateApplication(params: {
  fiscalCode?: string | null;
  email?: string;
  clientName: string;
  isTest?: boolean;
}) {
  const email = params.email?.trim().toLowerCase() || null;
  const fiscalCode = params.fiscalCode?.trim().toUpperCase() || null;

  // 1) Pratica aperta con stessa email mittente (caso tipico: seconda mail)
  if (email) {
    const [byEmail] = await db
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
    if (byEmail) {
      // Aggiorna CF se mancava e ora lo leggiamo dai nuovi doc
      if (fiscalCode && !byEmail.clientFiscalCode) {
        const [updated] = await db
          .update(applications)
          .set({
            clientFiscalCode: fiscalCode,
            updatedAt: new Date(),
          })
          .where(eq(applications.id, byEmail.id))
          .returning();
        return updated ?? byEmail;
      }
      return byEmail;
    }
  }

  // 2) Pratica aperta con stesso CF (doc OCR, email diversa/alias)
  if (fiscalCode) {
    const [byCf] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientFiscalCode, fiscalCode),
          inArray(applications.status, [...OPEN_STATUSES]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byCf) {
      if (email && byCf.clientEmail !== email) {
        // Conserva email già nota; non sovrascrivere
      }
      return byCf;
    }
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
 * Se per errore esistono più pratiche aperte con la stessa email, le fonde:
 * tiene la più recente e sposta i documenti delle altre.
 */
export async function mergeDuplicateOpenApplicationsByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const open = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.clientEmail, normalized),
        inArray(applications.status, [...OPEN_STATUSES]),
      ),
    )
    .orderBy(desc(applications.updatedAt));

  if (open.length <= 1) return open[0] ?? null;

  const [keep, ...dupes] = open;
  for (const dupe of dupes) {
    await db
      .update(documents)
      .set({ applicationId: keep.id })
      .where(eq(documents.applicationId, dupe.id));

    // Preferisci CF/nome dalla pratica più completa
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

    // Se quel tipo c'è già, non ricreare (es. seconda CI)
    if (
      analysis.documentType !== "SCONOSCIUTO" &&
      knownTypes.has(analysis.documentType) &&
      options?.applicationId
    ) {
      continue;
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
      if (
        analysis.documentType !== "SCONOSCIUTO" &&
        knownTypes.has(analysis.documentType)
      ) {
        applicationIds.add(app.id);
        continue;
      }
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
