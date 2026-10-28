/** Path / URL storage sito (Cloudflare R2 o legacy Blob). */
export function isSiteStorageKey(key: string | null | undefined): boolean {
  if (!key?.trim()) return false;
  const k = key.trim();
  if (k.startsWith("practices/")) return true;
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
