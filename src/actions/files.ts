"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { requireSession, type SessionUser } from "@/lib/auth";
import {
  STORAGE_FOLDER_KINDS,
  defaultStorageFolders,
  sanitizeFolderName,
  storageSubfolderLabel,
  type StorageFolderKind,
} from "@/lib/config/documents";
import { getAppBaseUrl } from "@/lib/app-url";
import { practiceStoragePrefix } from "@/lib/storage/blob";
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

function folderKindFromName(
  folderName: string,
  clientName: string,
): StorageFolderKind | null {
  for (const kind of STORAGE_FOLDER_KINDS) {
    if (storageSubfolderLabel(kind, clientName) === folderName) return kind;
  }
  return null;
}

async function ensureFoldersPersisted(
  applicationId: string,
  clientName: string,
  current: string[] | null | undefined,
  discovered: string[],
) {
  const defaults = defaultStorageFolders(clientName);
  const base = current?.length ? current : defaults;
  const merged = [...new Set([...base, ...discovered])].filter(Boolean);

  const same =
    current?.length === merged.length &&
    !!current &&
    current.every((f) => merged.includes(f)) &&
    merged.every((f) => current.includes(f));

  if (!same) {
    await db
      .update(applications)
      .set({ storageFolders: merged, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }
  return merged;
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

export async function createStorageFolderAction(
  applicationId: string,
  folderName: string,
) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  const name = sanitizeFolderName(folderName);
  if (!name) return { error: "Nome cartella non valido" };

  const folders = [
    ...new Set([
      ...(app.storageFolders?.length
        ? app.storageFolders
        : defaultStorageFolders(app.clientName)),
      name,
    ]),
  ];

  await db
    .update(applications)
    .set({ storageFolders: folders, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  revalidateFiles(applicationId);
  return { ok: true, folderName: name };
}

export async function deleteStorageFolderAction(
  applicationId: string,
  folderName: string,
) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  const name = sanitizeFolderName(folderName);
  if (!name) return { error: "Cartella non valida" };

  const docs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.applicationId, applicationId),
        eq(documents.storageSubfolder, name),
      ),
    );

  for (const doc of docs) {
    if (doc.driveFileId) {
      try {
        await deleteBlobByPathname(doc.driveFileId);
      } catch (err) {
        console.error("blob delete on folder remove", err);
      }
    }
  }

  if (docs.length > 0) {
    await db
      .delete(documents)
      .where(
        and(
          eq(documents.applicationId, applicationId),
          eq(documents.storageSubfolder, name),
        ),
      );
  }

  const base =
    app.storageFolders?.length > 0
      ? app.storageFolders
      : defaultStorageFolders(app.clientName);
  const folders = base.filter((f) => f !== name);

  await db
    .update(applications)
    .set({ storageFolders: folders, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  await refreshApplicationState(applicationId);
  revalidateFiles(applicationId);
  return { ok: true, deletedFiles: docs.length };
}

export async function createClientFolderAction(clientName: string) {
  const session = await requireSession();
  const name = sanitizeFolderName(clientName);
  if (!name) return { error: "Inserisci il nome cliente / cartella" };

  const folders = defaultStorageFolders(name);
  const email = `cartella.${Date.now()}@euroansa.local`;

  const [created] = await db
    .insert(applications)
    .values({
      clientName: name,
      clientEmail: email,
      employmentType: "ALTRO",
      status: "DOCUMENTI_INCOMPLETI",
      requiredDocumentTypes: [],
      storageFolders: folders,
      brokerId: session.id,
      isTest: false,
      driveFolderUrl: null,
      driveFolderId: null,
    })
    .returning();

  if (!created) return { error: "Creazione cartella fallita" };

  const prefix = practiceStoragePrefix(created.id);
  const folderUrl = `${getAppBaseUrl()}/dashboard/files/${created.id}`;
  await db
    .update(applications)
    .set({
      driveFolderId: prefix,
      driveFolderUrl: folderUrl,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, created.id));

  revalidatePath("/dashboard/files");
  revalidatePath("/dashboard");
  return { ok: true, applicationId: created.id };
}

export async function uploadToFolderAction(
  applicationId: string,
  folderName: string,
  formData: FormData,
) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  const subfolder = sanitizeFolderName(folderName);
  if (!subfolder) return { error: "Cartella non valida" };

  const files = formData.getAll("files") as File[];
  const incoming = files.filter((f) => f && f.size > 0);
  if (incoming.length === 0) return { error: "Nessun file selezionato" };

  // assicura che la cartella esista nell'elenco
  const folders = [
    ...new Set([
      ...(app.storageFolders?.length
        ? app.storageFolders
        : defaultStorageFolders(app.clientName)),
      subfolder,
    ]),
  ];
  if (
    !app.storageFolders?.includes(subfolder) ||
    folders.length !== (app.storageFolders?.length ?? 0)
  ) {
    await db
      .update(applications)
      .set({ storageFolders: folders, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  const kind = folderKindFromName(subfolder, app.clientName);
  const useAi = kind === "DOC" || kind === "BANCA" || kind === "IMMOBILE";

  if (!useAi) {
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
        console.error("folder upload", err);
        return {
          error: err instanceof Error ? err.message : "Upload fallito",
        };
      }
    }
    revalidateFiles(applicationId);
    return { ok: true, count };
  }

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

/** Esportato per la page server: unisce cartelle salvate + trovate sui file */
export async function syncStorageFoldersForApp(applicationId: string) {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return [] as string[];

  const docs = await db
    .select({ storageSubfolder: documents.storageSubfolder })
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  const discovered = docs
    .map((d) => d.storageSubfolder?.trim())
    .filter((x): x is string => Boolean(x));

  return ensureFoldersPersisted(
    applicationId,
    app.clientName,
    app.storageFolders,
    discovered,
  );
}
