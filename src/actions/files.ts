"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { requireSession, type SessionUser } from "@/lib/auth";
import {
  STORAGE_FOLDER_KINDS,
  storageSubfolderLabel,
  type StorageFolderKind,
} from "@/lib/config/documents";
import { processIncomingFiles, refreshApplicationState } from "@/lib/pipeline";
import {
  deleteBlobByPathname,
  uploadPracticeFile,
  uploadRelazioneFile,
} from "@/lib/storage/blob";

async function assertCanAccessApp(
  session: SessionUser,
  applicationId: string,
) {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" as const };
  if (app.isTest && session.role !== "ADMIN") {
    return { error: "Accesso negato" as const };
  }
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return { error: "Accesso negato" as const };
  }
  return { app };
}

function revalidateFiles(applicationId: string) {
  revalidatePath("/dashboard/files");
  revalidatePath(`/dashboard/files/${applicationId}`);
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
}

export async function deleteDocumentFileAction(documentId: string) {
  const session = await requireSession();
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { error: "Documento non trovato" };

  const access = await assertCanAccessApp(session, doc.applicationId);
  if ("error" in access) return access;

  if (doc.driveFileId) {
    try {
      await deleteBlobByPathname(doc.driveFileId);
    } catch (err) {
      console.error("blob delete document", err);
    }
  }

  await db.delete(documents).where(eq(documents.id, documentId));
  await refreshApplicationState(doc.applicationId);
  revalidateFiles(doc.applicationId);
  return { ok: true };
}

export async function deleteRelazioneAction(applicationId: string) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  if (app.relazioneStorageKey) {
    try {
      await deleteBlobByPathname(app.relazioneStorageKey);
    } catch (err) {
      console.error("blob delete relazione", err);
    }
  }

  await db
    .update(applications)
    .set({
      relazioneStorageKey: null,
      relazioneFileName: null,
      relazioneUploadedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  revalidateFiles(applicationId);
  return { ok: true };
}

export async function uploadToFolderAction(
  applicationId: string,
  folderKind: StorageFolderKind,
  formData: FormData,
) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  if (!STORAGE_FOLDER_KINDS.includes(folderKind)) {
    return { error: "Cartella non valida" };
  }

  const files = formData.getAll("files") as File[];
  const incoming = files.filter((f) => f && f.size > 0);
  if (incoming.length === 0) return { error: "Nessun file selezionato" };

  const subfolder = storageSubfolderLabel(folderKind, app.clientName);

  // EUROANSA: archivio libero senza AI (come scansioni ufficio)
  if (folderKind === "EUROANSA") {
    let count = 0;
    for (const file of incoming) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName = file.name.replace(/[\\/]+/g, "_");
      try {
        const uploaded = await uploadPracticeFile({
          applicationId,
          subfolder,
          fileName: safeName,
          mimeType: file.type || "application/octet-stream",
          buffer,
        });
        const [inserted] = await db
          .insert(documents)
          .values({
            applicationId,
            rawFileName: file.name,
            renamedFileName: safeName,
            documentType: "SCONOSCIUTO",
            driveFileId: uploaded.pathname,
            driveFileUrl: null,
            storageSubfolder: subfolder,
            isValid: true,
            extractedData: {},
            validationIssues: [],
          })
          .returning({ id: documents.id });
        if (inserted) {
          await db
            .update(documents)
            .set({ driveFileUrl: `/api/files/${inserted.id}` })
            .where(eq(documents.id, inserted.id));
        }
        count += 1;
      } catch (err) {
        console.error("euroansa upload", err);
        return {
          error:
            err instanceof Error ? err.message : "Upload EUROANSA fallito",
        };
      }
    }
    revalidateFiles(applicationId);
    return { ok: true, count };
  }

  // DOC / BANCA / IMMOBILE: pipeline AI + forza cartella scelta
  const processed = await processIncomingFiles(
    await Promise.all(
      incoming.map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        mimeType: f.type || "application/octet-stream",
        originalFileName: f.name,
      })),
    ),
    {
      applicationId,
      brokerId: app.brokerId ?? session.id,
    },
  );

  for (const file of incoming) {
    await db
      .update(documents)
      .set({ storageSubfolder: subfolder })
      .where(
        and(
          eq(documents.applicationId, applicationId),
          eq(documents.rawFileName, file.name),
        ),
      );
  }

  revalidateFiles(applicationId);
  return {
    ok: true,
    count: processed.processed,
    errors: processed.errors,
  };
}

export async function replaceDocumentFileAction(
  documentId: string,
  formData: FormData,
) {
  const session = await requireSession();
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { error: "Documento non trovato" };

  const access = await assertCanAccessApp(session, doc.applicationId);
  if ("error" in access) return access;
  const { app } = access;

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Seleziona un file" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const subfolder =
    doc.storageSubfolder ||
    storageSubfolderLabel("DOC", app.clientName);
  const fileName = doc.renamedFileName || file.name.replace(/[\\/]+/g, "_");

  try {
    if (doc.driveFileId) {
      try {
        await deleteBlobByPathname(doc.driveFileId);
      } catch {
        // ignore missing old blob
      }
    }
    const uploaded = await uploadPracticeFile({
      applicationId: doc.applicationId,
      subfolder,
      fileName,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });
    await db
      .update(documents)
      .set({
        rawFileName: file.name,
        driveFileId: uploaded.pathname,
        driveFileUrl: `/api/files/${doc.id}`,
        storageSubfolder: subfolder,
      })
      .where(eq(documents.id, documentId));
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Sostituzione fallita",
    };
  }

  await refreshApplicationState(doc.applicationId);
  revalidateFiles(doc.applicationId);
  return { ok: true };
}

export async function uploadRelazioneFromFilesAction(
  applicationId: string,
  formData: FormData,
) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  const file = formData.get("relazione") as File | null;
  if (!file || file.size === 0) {
    return { error: "Seleziona un PDF relazione" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (app.relazioneStorageKey) {
      try {
        await deleteBlobByPathname(app.relazioneStorageKey);
      } catch {
        // ignore
      }
    }
    const uploaded = await uploadRelazioneFile({
      applicationId,
      clientName: app.clientName,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      buffer,
    });
    await db
      .update(applications)
      .set({
        relazioneStorageKey: uploaded.pathname,
        relazioneFileName: uploaded.pathname.split("/").pop() ?? file.name,
        relazioneUploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Upload relazione fallito",
    };
  }

  await refreshApplicationState(applicationId);
  revalidateFiles(applicationId);
  return { ok: true };
}
