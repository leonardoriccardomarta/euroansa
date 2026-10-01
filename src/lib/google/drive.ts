import { Readable } from "stream";
import {
  DRIVE_SUBFOLDERS,
  driveSubfolderForDocument,
  type DriveSubfolder,
} from "@/lib/config/documents";
import type { DocumentType } from "@/db/schema";
import { getDriveClient } from "./auth";

function folderName(clientName: string, applicationId: string): string {
  const shortId = applicationId.slice(0, 8);
  return `${clientName.trim()} - Mutuo (${shortId})`;
}

async function findChildFolder(
  parentId: string,
  name: string,
): Promise<{ id: string; webViewLink?: string | null } | null> {
  const drive = getDriveClient();
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
): Promise<string> {
  const found = await findChildFolder(parentId, name);
  if (found?.id) return found.id;

  const drive = getDriveClient();
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
): Promise<{ folderId: string; folderUrl: string }> {
  const drive = getDriveClient();
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

  // Sottocartelle Filippo: doc clienti / banca / immobile / euroansa
  for (const sub of DRIVE_SUBFOLDERS) {
    await ensureChildFolder(folderId, sub);
  }

  return { folderId, folderUrl };
}

export async function resolveUploadFolderId(
  rootFolderId: string,
  documentType: DocumentType,
): Promise<string> {
  const sub = driveSubfolderForDocument(documentType);
  return ensureChildFolder(rootFolderId, sub as DriveSubfolder);
}

export async function uploadFileToDrive(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  documentType?: DocumentType;
}): Promise<{ driveFileId: string; driveFileUrl: string }> {
  const drive = getDriveClient();
  const parentId = params.documentType
    ? await resolveUploadFolderId(params.folderId, params.documentType)
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
): Promise<{ buffer: Buffer; mimeType: string }> {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType",
  });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return {
    buffer: Buffer.from(res.data as ArrayBuffer),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
  };
}
