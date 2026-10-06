import {
  isEuroansaFolder,
  storageSubfolderLabel,
} from "@/lib/config/documents";

/**
 * Cartelle checklist: solo DOC + IMMOBILE (documenti cliente da mail).
 * BANCA e EUROANSA = firmati / operativo → fuori checklist e senza "Classifica".
 */
export function isClientChecklistFolder(
  storageSubfolder: string | null | undefined,
  clientName: string,
): boolean {
  const raw = (storageSubfolder ?? "").trim();
  if (!raw) return true;
  if (isEuroansaFolder(raw)) return false;

  const n = raw.toUpperCase();
  if (n === "BANCA" || n === "EUROANSA" || n === "UFFICIO") return false;

  const docLabel = storageSubfolderLabel("DOC", clientName).toUpperCase();
  const immLabel = storageSubfolderLabel("IMMOBILE", clientName).toUpperCase();

  if (n === docLabel || n.endsWith(" DOC") || /\bDOC\b/.test(n)) return true;
  if (n === immLabel || n === "IMMOBILE") return true;
  return false;
}
