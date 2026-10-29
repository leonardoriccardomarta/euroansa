"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import type { DocumentType } from "@/db/schema";
import { requireSession, type SessionUser } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  CHECKLIST_DOCUMENT_TYPES,
  FILE_NAME_PREFIX,
  STORAGE_FOLDER_KINDS,
  clientSurnameShort,
  defaultStorageFolders,
  normalizeStorageFolderName,
  sanitizeFolderName,
  storageFolderKindForDocument,
  storageSubfolderLabel,
  type StorageFolderKind,
} from "@/lib/config/documents";
import {
  processIncomingFiles,
  refreshApplicationState,
  resolveUniqueFileName,
} from "@/lib/pipeline";
import { setApplicationPipelineError } from "@/lib/applications/errors";
import {
  deleteBlobByPathname,
  practiceStoragePrefix,
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
  const normalized = normalizeStorageFolderName(folderName);
  for (const kind of STORAGE_FOLDER_KINDS) {
    if (storageSubfolderLabel(kind, clientName) === normalized) return kind;
  }
  return null;
}

async function ensureFoldersPersisted(
  applicationId: string,
  clientName: string,
  current: string[] | null | undefined,
  discovered: string[],
  isCouple?: boolean,
  coApplicantName?: string | null,
) {
  const defaults = defaultStorageFolders(clientName, isCouple, coApplicantName);
  // Preserva l'ordine esatto definito dall'utente e non cancellare mai cartelle custom/vuote
  let base = current && current.length > 0 ? [...current] : [...defaults];

  // Se la pratica e' di coppia, assicuriamoci che entrambe le cartelle personali esistano in base
  if (isCouple) {
    const f1 = defaults[0];
    const f2 = defaults[1];
    const hasF2 = base.some(
      (f) =>
        f.trim().toUpperCase() === f2.trim().toUpperCase() ||
        /richiedente\s*2/i.test(f),
    );
    if (!hasF2) {
      const idx1 = base.findIndex(
        (f) =>
          f.trim().toUpperCase() === f1.trim().toUpperCase() ||
          /DOC$/i.test(f) ||
          /richiedente\s*1/i.test(f),
      );
      if (idx1 >= 0) {
        base.splice(idx1 + 1, 0, f2);
      } else {
        base.unshift(f2);
      }
    }
  }

  const existingSet = new Set(base.map((f) => f.trim().toUpperCase()));
  const newDiscovered = discovered
    .map((f) => f.trim())
    .filter((f) => Boolean(f) && !existingSet.has(f.toUpperCase()));
  const merged = [...base, ...newDiscovered].filter(Boolean);

  const same =
    current &&
    current.length === merged.length &&
    current.every((f, i) => f === merged[i]);

  if (!same) {
    await db
      .update(applications)
      .set({ storageFolders: merged, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  // Migra etichetta legacy UFFICIO → EUROANSA sui documenti
  await db
    .update(documents)
    .set({ storageSubfolder: "EUROANSA" })
    .where(
      and(
        eq(documents.applicationId, applicationId),
        eq(documents.storageSubfolder, "UFFICIO"),
      ),
    );

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

export async function renameDocumentFileAction(
  documentId: string,
  newFileName: string,
): Promise<{ ok: true; renamedFileName: string } | { error: string }> {
  const session = await requireSession();
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { error: "Documento non trovato" };

  const access = await assertCanAccessApp(session, doc.applicationId);
  if ("error" in access && access.error) return { error: access.error };

  let cleaned = newFileName.trim().replace(/[\\/]+/g, "_");
  if (!cleaned) return { error: "Nome file non valido" };

  // Preserva estensione .pdf
  if (!cleaned.toLowerCase().endsWith(".pdf")) {
    cleaned = `${cleaned}.pdf`;
  }

  // Risolve collisioni di nomi su documenti attivi della stessa pratica
  const uniqueName = await resolveUniqueFileName(
    doc.applicationId,
    cleaned,
    doc.id,
  );

  await db
    .update(documents)
    .set({
      renamedFileName: uniqueName,
    })
    .where(eq(documents.id, documentId));

  await db
    .update(applications)
    .set({ updatedAt: new Date() })
    .where(eq(applications.id, doc.applicationId));

  revalidateFiles(doc.applicationId);
  return { ok: true, renamedFileName: uniqueName };
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

  const existing = app.storageFolders?.length
    ? app.storageFolders
    : defaultStorageFolders(app.clientName, app.isCouple, app.coApplicantName);

  if (existing.some((f) => f.toLowerCase() === name.toLowerCase())) {
    return { ok: true, folderName: name };
  }

  const folders = [...existing, name];

  await db
    .update(applications)
    .set({ storageFolders: folders, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  revalidateFiles(applicationId);
  return { ok: true, folderName: name };
}

/** Rinomina inline cartella (e aggiorna i documenti corrispondenti) */
export async function renameStorageFolderAction(
  applicationId: string,
  oldName: string,
  newName: string,
) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  const sanitizedOld = oldName.trim();
  const sanitizedNew = sanitizeFolderName(newName);
  if (!sanitizedNew) return { error: "Nome cartella non valido" };

  const currentFolders = app.storageFolders?.length
    ? app.storageFolders
    : defaultStorageFolders(app.clientName, app.isCouple, app.coApplicantName);

  let updatedFolders = currentFolders.map((f) =>
    f.toLowerCase() === sanitizedOld.toLowerCase() ? sanitizedNew : f,
  );

  if (!updatedFolders.includes(sanitizedNew)) {
    updatedFolders.push(sanitizedNew);
  }

  await db
    .update(applications)
    .set({ storageFolders: updatedFolders, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  // Aggiorna mapping logico dei file nella cartella (il path fisico R2 non viene modificato)
  await db
    .update(documents)
    .set({ storageSubfolder: sanitizedNew })
    .where(
      and(
        eq(documents.applicationId, applicationId),
        eq(documents.storageSubfolder, sanitizedOld),
      ),
    );

  revalidateFiles(applicationId);
  return { ok: true, newName: sanitizedNew };
}

/** Sposta l'ordine di visualizzazione di una cartella in alto o in basso */
export async function reorderStorageFolderAction(
  applicationId: string,
  folderName: string,
  direction: "up" | "down",
) {
  const session = await requireSession();
  const access = await assertCanAccessApp(session, applicationId);
  if ("error" in access) return access;
  const { app } = access;

  const currentFolders = [
    ...(app.storageFolders?.length
      ? app.storageFolders
      : defaultStorageFolders(app.clientName, app.isCouple, app.coApplicantName)),
  ];

  const index = currentFolders.findIndex(
    (f) => f.toLowerCase() === folderName.trim().toLowerCase(),
  );
  if (index === -1) return { error: "Cartella non trovata" };

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= currentFolders.length) {
    return { ok: true, folders: currentFolders };
  }

  const temp = currentFolders[index];
  currentFolders[index] = currentFolders[targetIndex];
  currentFolders[targetIndex] = temp;

  await db
    .update(applications)
    .set({ storageFolders: currentFolders, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  revalidateFiles(applicationId);
  return { ok: true, folders: currentFolders };
}

/** Sposta un file tra cartelle (modifica solo mapping logico DB, non la storageKey fisica R2) */
export async function moveDocumentFolderAction(
  documentId: string,
  targetFolder: string,
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

  const sanitizedTarget = sanitizeFolderName(targetFolder);
  if (!sanitizedTarget) return { error: "Cartella di destinazione non valida" };

  // Aggiorna SOLO il mapping logico storageSubfolder nel database
  // NON modifica né rompe la storageKey fisica Cloudflare R2 (driveFileId)
  await db
    .update(documents)
    .set({ storageSubfolder: sanitizedTarget })
    .where(eq(documents.id, documentId));

  // Assicura che la cartella sia salvata anche nell'elenco storageFolders della pratica
  const [app] = await db
    .select({
      storageFolders: applications.storageFolders,
      clientName: applications.clientName,
      isCouple: applications.isCouple,
      coApplicantName: applications.coApplicantName,
    })
    .from(applications)
    .where(eq(applications.id, doc.applicationId))
    .limit(1);

  if (app) {
    const existing = app.storageFolders?.length
      ? app.storageFolders
      : defaultStorageFolders(app.clientName, app.isCouple, app.coApplicantName);
    if (
      !existing.some((f) => f.toLowerCase() === sanitizedTarget.toLowerCase())
    ) {
      await db
        .update(applications)
        .set({
          storageFolders: [...existing, sanitizedTarget],
          updatedAt: new Date(),
        })
        .where(eq(applications.id, doc.applicationId));
    }
  }

  revalidateFiles(doc.applicationId);
  return { ok: true, targetFolder: sanitizedTarget };
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
      : defaultStorageFolders(app.clientName, app.isCouple, app.coApplicantName);
  const folders = base.filter((f) => f !== name);

  await db
    .update(applications)
    .set({ storageFolders: folders, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));

  await refreshApplicationState(applicationId);
  revalidateFiles(applicationId);
  return { ok: true, deletedFiles: docs.length };
}

export type CreatePracticeFolderInput =
  | string
  | {
      practiceType?: "Singola" | "Coppia";
      isCouple?: boolean;
      clientName?: string;
      clientFiscalCode?: string | null;
      applicant1Name?: string;
      applicant1FiscalCode?: string | null;
      coApplicantName?: string | null;
      coApplicantFiscalCode?: string | null;
      applicant2Name?: string | null;
      applicant2FiscalCode?: string | null;
    };

export async function createClientFolderAction(
  input: CreatePracticeFolderInput,
) {
  const session = await requireSession();
  const isCoppia =
    typeof input === "object" &&
    (input.practiceType === "Coppia" || Boolean(input.isCouple));

  let clientName = "";
  let clientFiscalCode: string | null = null;
  let coApplicantName: string | null = null;
  let coApplicantFiscalCode: string | null = null;
  let applicantFiscalCodes: string[] = [];

  if (typeof input === "string") {
    clientName = sanitizeFolderName(input);
  } else {
    const rawA1 = input.clientName || input.applicant1Name || "";
    const a1 = sanitizeFolderName(rawA1);
    const cf1 =
      input.clientFiscalCode?.trim().toUpperCase() ||
      input.applicant1FiscalCode?.trim().toUpperCase() ||
      null;
    clientFiscalCode = cf1;

    if (isCoppia) {
      const rawA2 = input.coApplicantName || input.applicant2Name || "";
      const a2 = sanitizeFolderName(rawA2);
      const cf2 =
        input.coApplicantFiscalCode?.trim().toUpperCase() ||
        input.applicant2FiscalCode?.trim().toUpperCase() ||
        null;
      coApplicantName = a2 || null;
      coApplicantFiscalCode = cf2;
      clientName = a2 ? `${a1} & ${a2}` : a1;
      applicantFiscalCodes = [cf1, cf2].filter((x): x is string => Boolean(x));
    } else {
      clientName = a1;
      applicantFiscalCodes = cf1 ? [cf1] : [];
    }
  }

  if (!clientName) return { error: "Inserisci il nome cliente / richiedente" };

  const folders = defaultStorageFolders(clientName, isCoppia, coApplicantName);
  const email = `cartella.${Date.now()}@prontopratica.local`;

  const [created] = await db
    .insert(applications)
    .values({
      clientName,
      clientEmail: email,
      clientFiscalCode,
      isCouple: isCoppia,
      coApplicantName,
      coApplicantFiscalCode,
      applicantFiscalCodes,
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
        const msg = err instanceof Error ? err.message : "Upload fallito";
        await setApplicationPipelineError(applicationId, `Storage: ${msg}`);
        return { error: msg };
      }
    }
    await setApplicationPipelineError(applicationId, null);
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

  if (processed.errors.length > 0) {
    await setApplicationPipelineError(
      applicationId,
      processed.errors.slice(0, 3).join("; "),
    );
  } else {
    await setApplicationPipelineError(applicationId, null);
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

/**
 * Broker accetta il documento nonostante i warning AI (scadenza / asilo / ecc.).
 * Serve a non bloccare checklist e invio segreteria.
 */
export async function acceptDocumentAnywayAction(documentId: string) {
  const session = await requireSession();
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { error: "Documento non trovato" };

  const access = await assertCanAccessApp(session, doc.applicationId);
  if ("error" in access && access.error) return { error: access.error };
  const app = access.app!;

  if (doc.documentType === "SCONOSCIUTO") {
    return {
      error:
        "Prima classifica il documento (tipo checklist), poi puoi accettarlo.",
    };
  }

  const note = `Accettato manualmente da ${session.name} nonostante avvisi AI`;
  const prev = (doc.validationIssues ?? []).filter(
    (i) => !i.startsWith("Accettato manualmente"),
  );

  await db
    .update(documents)
    .set({
      isValid: true,
      validationIssues: [note, ...prev],
      analysisStatus: "done",
    })
    .where(eq(documents.id, documentId));

  const required = new Set(app.requiredDocumentTypes ?? []);
  required.add(doc.documentType);
  await db
    .update(applications)
    .set({
      requiredDocumentTypes: [...required],
      updatedAt: new Date(),
    })
    .where(eq(applications.id, app.id));

  await refreshApplicationState(app.id);
  revalidateFiles(app.id);
  return { ok: true as const };
}

/**
 * Classifica / cambia tipo checklist di un documento (anche già tipizzato).
 * Rinomina, cartella DOC/IMMOBILE, spunta checklist.
 */
export async function classifyUnknownDocumentAction(
  documentId: string,
  documentType: DocumentType,
) {
  const session = await requireSession();
  if (!documentType || documentType === "SCONOSCIUTO") {
    return { error: "Scegli un tipo dalla checklist" };
  }
  if (!CHECKLIST_DOCUMENT_TYPES.includes(documentType)) {
    return { error: "Tipo non valido per la checklist" };
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) return { error: "Documento non trovato" };

  const access = await assertCanAccessApp(session, doc.applicationId);
  if ("error" in access && access.error) return { error: access.error };
  const app = access.app!;

  const ext = doc.rawFileName.includes(".")
    ? doc.rawFileName.slice(doc.rawFileName.lastIndexOf("."))
    : ".pdf";
  const surname = clientSurnameShort(app.clientName);
  const prefix = FILE_NAME_PREFIX[documentType] ?? "doc";
  const renamedFileName = `${surname}_${prefix}${ext}`;

  const folderKind = storageFolderKindForDocument(documentType);
  const storageSubfolder = storageSubfolderLabel(folderKind, app.clientName);

  await db
    .update(documents)
    .set({
      documentType,
      isValid: true,
      renamedFileName,
      storageSubfolder,
      validationIssues: [],
    })
    .where(eq(documents.id, documentId));

  const required = new Set(app.requiredDocumentTypes ?? []);
  required.add(documentType);
  await db
    .update(applications)
    .set({
      requiredDocumentTypes: [...required],
      updatedAt: new Date(),
    })
    .where(eq(applications.id, app.id));

  await refreshApplicationState(app.id);
  revalidateFiles(app.id);
  return { ok: true as const, renamedFileName };
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
    app.isCouple,
    app.coApplicantName,
  );
}
