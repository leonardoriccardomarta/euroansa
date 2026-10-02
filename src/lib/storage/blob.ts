import { del, get, list, put } from "@vercel/blob";

export type StoredBlob = {
  pathname: string;
  url: string;
};

function requireBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN mancante: crea uno store Blob su Vercel e aggiungi il token",
    );
  }
  return token;
}

export function practiceStoragePrefix(applicationId: string): string {
  return `practices/${applicationId}`;
}

export async function uploadPracticeFile(params: {
  applicationId: string;
  subfolder: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredBlob> {
  const token = requireBlobToken();
  const safeName = params.fileName.replace(/[\\/]+/g, "_");
  const pathname = `${practiceStoragePrefix(params.applicationId)}/${params.subfolder}/${safeName}`;

  const result = await put(pathname, params.buffer, {
    access: "private",
    token,
    contentType: params.mimeType || "application/octet-stream",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return { pathname: result.pathname, url: result.url };
}

export async function uploadRelazioneFile(params: {
  applicationId: string;
  clientName: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredBlob> {
  const token = requireBlobToken();
  const base =
    params.clientName.trim().replace(/[\\/]+/g, " ").replace(/\s+/g, " ") ||
    "Cliente";
  const ext = params.fileName.includes(".")
    ? params.fileName.slice(params.fileName.lastIndexOf("."))
    : ".pdf";
  const fileName = `${base}_relazione${ext}`;
  const pathname = `${practiceStoragePrefix(params.applicationId)}/${fileName}`;

  const result = await put(pathname, params.buffer, {
    access: "private",
    token,
    contentType: params.mimeType || "application/pdf",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return { pathname: result.pathname, url: result.url };
}

export async function downloadBlob(
  pathnameOrUrl: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const token = requireBlobToken();
  const result = await get(pathnameOrUrl, { access: "private", token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`File non trovato nello storage: ${pathnameOrUrl}`);
  }

  const chunks: Buffer[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  return {
    buffer: Buffer.concat(chunks),
    contentType:
      result.blob.contentType ||
      result.headers.get("content-type") ||
      "application/octet-stream",
  };
}

export async function deleteBlobByPathname(pathnameOrUrl: string): Promise<void> {
  const token = requireBlobToken();
  await del(pathnameOrUrl, { token });
}

export async function deletePracticeBlobs(applicationId: string): Promise<void> {
  const token = requireBlobToken();
  const prefix = `${practiceStoragePrefix(applicationId)}/`;
  let cursor: string | undefined;

  do {
    const page = await list({ prefix, token, cursor });
    const urls = page.blobs.map((b) => b.url);
    if (urls.length > 0) {
      await del(urls, { token });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
