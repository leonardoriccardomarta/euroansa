/** Path / URL storage sito (Cloudflare R2 o legacy Blob). */
export function isSiteStorageKey(key: string | null | undefined): boolean {
  if (!key?.trim()) return false;
  const k = key.trim();
  if (k.startsWith("practices/") || k.startsWith("/practices/")) return true;
  if (k.startsWith("r2://")) return true;
  if (k.includes("blob.vercel-storage.com")) return true;
  // Path relativi tipo cartella/file (non ID Drive alfanumerici)
  if (k.includes("/") && !k.startsWith("http")) return true;
  return false;
}

/** ID Google Drive legacy: non scaricabili dallo storage sito. */
export function isLegacyDriveKey(key: string | null | undefined): boolean {
  if (!key?.trim()) return false;
  return !isSiteStorageKey(key);
}

/**
 * Risolve la chiave di storage S3/R2 effettiva per un documento.
 * Se driveFileId è un path o URL valido, lo restituisce normalizzato.
 * In caso di path relativo o non prefissato, ricostruisce `practices/{applicationId}/{subfolder}/{filename}`.
 */
export function resolveDocumentStorageKey(doc: {
  driveFileId?: string | null;
  applicationId: string;
  storageSubfolder?: string | null;
  renamedFileName?: string | null;
  rawFileName?: string | null;
}): string | null {
  const raw = doc.driveFileId?.trim();
  if (raw && isSiteStorageKey(raw)) {
    let clean = raw.replace(/^\/+/, "").replace(/\/+/g, "/");
    const bucketName = process.env.R2_BUCKET_NAME?.trim();
    if (bucketName && clean.startsWith(`${bucketName}/`)) {
      clean = clean.slice(bucketName.length + 1);
    }
    return clean;
  }
  const fileName = (doc.renamedFileName || doc.rawFileName)?.trim();
  if (fileName && doc.applicationId) {
    const subfolder = (doc.storageSubfolder?.trim() || "DOC").replace(/^\/+|\/+$/g, "");
    const safeName = fileName.replace(/[\\/]+/g, "_");
    return `practices/${doc.applicationId}/${subfolder}/${safeName}`.replace(/\/+/g, "/");
  }
  return raw ? raw.replace(/^\/+/, "").replace(/\/+/g, "/") : null;
}
