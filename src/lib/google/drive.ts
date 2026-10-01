import { Readable } from "stream";
import { getDriveClient } from "./auth";

function folderName(clientName: string, applicationId: string): string {
  const shortId = applicationId.slice(0, 8);
  return `${clientName.trim()} - Mutuo (${shortId})`;
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

  if (existing.data.files?.[0]?.id) {
    const f = existing.data.files[0];
    return {
      folderId: f.id!,
      folderUrl:
        f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id, webViewLink",
  });

  const folderId = created.data.id!;
  return {
    folderId,
    folderUrl:
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${folderId}`,
  };
}

export async function uploadFileToDrive(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ driveFileId: string; driveFileUrl: string }> {
  const drive = getDriveClient();
  const stream = Readable.from(params.buffer);

  const created = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.folderId],
    },
    media: {
      mimeType: params.mimeType,
      body: stream,
    },
    fields: "id, webViewLink",
  });

  const driveFileId = created.data.id!;

  // Link condivisibile in visualizzazione (chiunque col link)
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
