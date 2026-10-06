import {
  isEuroansaFolder,
  storageSubfolderLabel,
} from "@/lib/config/documents";

/**
 * Cartelle i cui file tipizzati alimentano la checklist cliente.
 * Fuori solo EUROANSA (firmati) e la relazione (campo a parte).
 * BANCA sì: lì stanno estratto conto / movimenti del cliente.
 */
export function isClientChecklistFolder(
  storageSubfolder: string | null | undefined,
  clientName: string,
): boolean {
  const raw = (storageSubfolder ?? "").trim();
  if (!raw) return true;
  if (isEuroansaFolder(raw)) return false;

  const n = raw.toUpperCase();
  if (n === "EUROANSA" || n === "UFFICIO") return false;

  const docLabel = storageSubfolderLabel("DOC", clientName).toUpperCase();
  const immLabel = storageSubfolderLabel("IMMOBILE", clientName).toUpperCase();
  const bancaLabel = storageSubfolderLabel("BANCA", clientName).toUpperCase();

  if (n === docLabel || n.endsWith(" DOC") || /\bDOC\b/.test(n)) return true;
  if (n === immLabel || n === "IMMOBILE") return true;
  if (n === bancaLabel || n === "BANCA") return true;
  return false;
}
