import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import { analyzeDocument } from "@/lib/ai/analyze-document";
import { checkAnagraphicCoherence } from "@/lib/ai/coherence";
import { deriveApplicationStatus, evaluateChecklist } from "@/lib/checklist";
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
            eq(applications.status, "IN_ATTESA_DOCUMENTI"),
            eq(applications.status, "DOCUMENTI_INCOMPLETI"),
            eq(applications.status, "COMPLETA_DA_INOLTRARE"),
            eq(applications.status, "ANOMALIA"),
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
      status: "IN_ATTESA_DOCUMENTI",
      isTest: params.isTest ?? false,
    })
    .returning();

  return created;
}

export async function processIncomingFiles(
  files: IncomingFile[],
  options?: { applicationId?: string; isTest?: boolean },
) {
  if (files.length === 0) {
    return { processed: 0, applicationIds: [] as string[], errors: [] as string[] };
  }

  // Sequenziale (non parallel): free tier Gemini ~5 req/min
  const analyses: PromiseSettledResult<
    Awaited<ReturnType<typeof analyzeDocument>>
  >[] = [];
  for (const f of files) {
    try {
      const value = await analyzeDocument({
        buffer: f.buffer,
        mimeType: f.mimeType,
        originalFileName: f.originalFileName,
      });
      analyses.push({ status: "fulfilled", value });
    } catch (reason) {
      analyses.push({ status: "rejected", reason });
    }
  }

  const errors: string[] = [];
  for (let i = 0; i < analyses.length; i++) {
    const result = analyses[i];
    if (result.status === "rejected") {
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      errors.push(`${files[i].originalFileName}: ${reason}`);
      console.error("analyze failed", files[i].originalFileName, reason);
    }
  }

  const applicationIds = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = analyses[i];
    if (result.status !== "fulfilled") continue;

    const analysis = result.value;
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
    }

    // Aggiorna anagrafica se mancante
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

    // Evita duplicati sullo stesso raw file name
    const [existingDoc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.applicationId, app.id),
          eq(documents.rawFileName, file.originalFileName),
        ),
      )
      .limit(1);
    if (existingDoc) {
      applicationIds.add(app.id);
      continue;
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

    applicationIds.add(app.id);
  }

  for (const applicationId of applicationIds) {
    await refreshApplicationState(applicationId);
  }

  return {
    processed: analyses.filter((a) => a.status === "fulfilled").length,
    applicationIds: [...applicationIds],
    errors,
  };
}

export async function refreshApplicationState(applicationId: string) {
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

  const coherenceIssues = checkAnagraphicCoherence(docs);
  const preScoring = computePreScoring(docs);
  if (coherenceIssues.length) {
    preScoring.notes = [...(preScoring.notes ?? []), ...coherenceIssues];
  }

  let nextStatus = deriveApplicationStatus(
    app.employmentType,
    docs,
    app.status,
  );

  if (coherenceIssues.length && nextStatus === "COMPLETA_DA_INOLTRARE") {
    nextStatus = "ANOMALIA";
  }

  await db
    .update(applications)
    .set({
      preScoringData: preScoring,
      ...(nextStatus ? { status: nextStatus } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  const checklist = evaluateChecklist(app.employmentType, docs);
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
        console.error("Secretary send failed", err);
        await db
          .update(applications)
          .set({ status: "COMPLETA_DA_INOLTRARE", updatedAt: new Date() })
          .where(eq(applications.id, applicationId));
      }
    } else if (!alreadySent) {
      await db
        .update(applications)
        .set({ status: "COMPLETA_DA_INOLTRARE", updatedAt: new Date() })
        .where(eq(applications.id, applicationId));
    }
  }
}
