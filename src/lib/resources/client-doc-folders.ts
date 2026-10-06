import {
  isEuroansaFolder,
  storageSubfolderLabel,
} from "@/lib/config/documents";

/**
 * Cartelle che alimentano la checklist:
 * documenti mandati dal cliente (DOC + IMMOBILE).
 * Fuori: EUROANSA (firmati), BANCA (operativo istituto), relazione.
 */
export function isClientChecklistFolder(
  storageSubfolder: string | null | undefined,
  clientName: string,
): boolean {
  const raw = (storageSubfolder ?? "").trim();
  if (!raw) {
    // default upload senza cartella = DOC cliente
    return true;
  }
  if (isEuroansaFolder(raw)) return false;
  const n = raw.toUpperCase();
  if (n === "BANCA" || n === "EUROANSA" || n === "UFFICIO") return false;

  const docLabel = storageSubfolderLabel("DOC", clientName).toUpperCase();
  const immLabel = storageSubfolderLabel("IMMOBILE", clientName).toUpperCase();
  if (n === docLabel || n.endsWith(" DOC") || /\bDOC\b/.test(n)) return true;
  if (n === immLabel || n === "IMMOBILE") return true;
  return false;
}
