import { Readable } from "stream";
import {
  DRIVE_SUBFOLDERS,
  driveSubfolderForDocument,
  type DriveSubfolder,
} from "@/lib/config/documents";
import type { DocumentType } from "@/db/schema";
import type { GoogleOAuthClient } from "./auth";
import { getDriveClient } from "./auth";

function folderName(clientName: string, applicationId: string): string {
  const shortId = applicationId.slice(0, 8);
  return `${clientName.trim()} - Mutuo (${shortId})`;
}

async function findChildFolder(
  parentId: string,
  name: string,
  auth?: GoogleOAuthClient,
): Promise<{ id: string; webViewLink?: string | null } | null> {
  const drive = getDriveClient(auth);
  const existing = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
    fields: "files(id, name, webViewLink)",
    spaces: "drive",
    pageSize: 1,
  });
  const f = existing.data.files?.[0];
  if (!f?.id) return null;
  return { id: f.id, webViewLink: f.webViewLink };
}

async function ensureChildFolder(
  parentId: string,
  name: string,
  auth?: GoogleOAuthClient,
): Promise<string> {
  const found = await findChildFolder(parentId, name, auth);
  if (found?.id) return found.id;

  const drive = getDriveClient(auth);
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id!;
}

export async function getOrCreateClientFolder(
  clientName: string,
  applicationId: string,
  auth?: GoogleOAuthClient,
): Promise<{ folderId: string; folderUrl: string }> {
  const drive = getDriveClient(auth);
  const name = folderName(clientName, applicationId);

  const existing = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
    fields: "files(id, name, webViewLink)",
    spaces: "drive",
    pageSize: 1,
  });

  let folderId: string;
  let folderUrl: string;

  if (existing.data.files?.[0]?.id) {
    const f = existing.data.files[0];
    folderId = f.id!;
    folderUrl =
      f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`;
  } else {
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id, webViewLink",
    });
    folderId = created.data.id!;
    folderUrl =
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${folderId}`;
  }

  for (const sub of DRIVE_SUBFOLDERS) {
    await ensureChildFolder(folderId, sub, auth);
  }

  return { folderId, folderUrl };
}

export async function resolveUploadFolderId(
  rootFolderId: string,
  documentType: DocumentType,
  auth?: GoogleOAuthClient,
): Promise<string> {
  const sub = driveSubfolderForDocument(documentType);
  return ensureChildFolder(rootFolderId, sub as DriveSubfolder, auth);
}

export async function uploadFileToDrive(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  documentType?: DocumentType;
  auth?: GoogleOAuthClient;
}): Promise<{ driveFileId: string; driveFileUrl: string }> {
  const drive = getDriveClient(params.auth);
  const parentId = params.documentType
    ? await resolveUploadFolderId(
        params.folderId,
        params.documentType,
        params.auth,
      )
    : params.folderId;

  const stream = Readable.from(params.buffer);

  const created = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [parentId],
    },
    media: {
      mimeType: params.mimeType,
      body: stream,
    },
    fields: "id, webViewLink",
  });

  const driveFileId = created.data.id!;

  try {
    await drive.permissions.create({
      fileId: driveFileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
  } catch {
    // Ignora se i permessi non possono essere impostati
  }

  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: "webViewLink",
  });

  return {
    driveFileId,
    driveFileUrl:
      meta.data.webViewLink ??
      `https://drive.google.com/file/d/${driveFileId}/view`,
  };
}

export async function downloadFileFromDrive(
  fileId: string,
  auth?: GoogleOAuthClient,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const drive = getDriveClient(auth);
  const meta = await drive.files.get({
    fileId,
    fields: "name,mimeType,trashed",
    supportsAllDrives: true,
  });
  if (meta.data.trashed) {
    throw new Error("File Drive nel cestino");
  }
  const name = meta.data.name?.trim() || `drive_${fileId}`;
  const mime = meta.data.mimeType ?? "application/octet-stream";

  // Documenti nativi Google → PDF
  if (mime.startsWith("application/vnd.google-apps.")) {
    if (mime === "application/vnd.google-apps.folder") {
      throw new Error("Cartella Drive: non è un file singolo");
    }
    const exportable = [
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.spreadsheet",
      "application/vnd.google-apps.presentation",
      "application/vnd.google-apps.drawing",
    ];
    if (!exportable.includes(mime)) {
      throw new Error(`Tipo Drive non supportato: ${mime}`);
    }
    const res = await drive.files.export(
      { fileId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" },
    );
    const base = name.replace(/\.[^.]+$/, "");
    return {
      buffer: Buffer.from(res.data as ArrayBuffer),
      mimeType: "application/pdf",
      fileName: `${base}.pdf`,
    };
  }

  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return {
    buffer: Buffer.from(res.data as ArrayBuffer),
    mimeType: mime,
    fileName: name,
  };
}

/** Elenca file in una cartella Drive (non ricorsivo). */
export async function listDriveFolderFileIds(
  folderId: string,
  auth?: GoogleOAuthClient,
): Promise<string[]> {
  const drive = getDriveClient(auth);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken, files(id)",
      pageSize: 50,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of page.data.files ?? []) {
      if (f.id) ids.push(f.id);
    }
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}
