import { and, desc, eq, inArray, or } from "drizzle-orm";
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

async function findOrCreateApplication(params: {
  fiscalCode?: string | null;
  email?: string;
  clientName: string;
  isTest?: boolean;
}) {
  if (params.fiscalCode) {
    const [byCf] = await db
      .select()
      .from(applications)
      .where(eq(applications.clientFiscalCode, params.fiscalCode.toUpperCase()))
      .limit(1);
    if (byCf) return byCf;
  }

  if (params.email) {
    const [byEmail] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientEmail, params.email.toLowerCase()),
          or(
            eq(applications.status, "DOCUMENTI_INCOMPLETI"),
            eq(applications.status, "COMPLETA_DA_INOLTRARE"),
          ),
        ),
      )
      .limit(1);
    if (byEmail) return byEmail;
  }

  const [created] = await db
    .insert(applications)
    .values({
      clientName: params.clientName,
      clientEmail: (params.email ?? "sconosciuto@email.local").toLowerCase(),
      clientFiscalCode: params.fiscalCode?.toUpperCase() ?? null,
      status: "DOCUMENTI_INCOMPLETI",
      isTest: params.isTest ?? false,
    })
    .returning();

  return created;
}

/** Crea pratica da mail con oggetto giusto (anche senza allegati). */
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
