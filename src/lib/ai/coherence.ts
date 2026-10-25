import type { Document } from "@/db/schema";

/** Note informative cointestatari (non bloccanti). */
export function coupleCoherenceNotes(
  docs: Pick<Document, "extractedData">[],
): string[] {
  const notes: string[] = [];
  const withData = docs.filter((d) => d.extractedData);

  const fiscalCodes = withData
    .map((d) => d.extractedData?.fiscalCode?.toUpperCase().trim())
    .filter((c): c is string => Boolean(c && c.length >= 11));
  const uniqueCf = [...new Set(fiscalCodes)];
  if (uniqueCf.length > 0) {
    notes.push(`Cointestatari (pratica coppia): CF ${uniqueCf.join(", ")}`);
  }

  const lastNames = withData
    .map((d) => d.extractedData?.lastName?.toUpperCase().trim())
    .filter((n): n is string => Boolean(n));
  const uniqueLast = [...new Set(lastNames)];
  if (uniqueLast.length > 1) {
    notes.push(`Cointestatari: cognomi ${uniqueLast.join(", ")}`);
  }

  return notes;
}

export function checkAnagraphicCoherence(
  docs: Array<
    Pick<Document, "extractedData" | "renamedFileName" | "isValid"> & {
      documentType?: Document["documentType"];
      storageSubfolder?: string | null;
    }
  >,
  options?: { isCouple?: boolean },
): string[] {
  // Su pratica coppia i CF/cognomi diversi sono attesi → niente errori bloccanti
  if (options?.isCouple) return [];

  const issues: string[] = [];
  // Escludi documenti immobile (venditori, tecnici, precedenti proprietari hanno CF diversi)
  const isPropertyDoc = (d: typeof docs[number]) => {
    const type = d.documentType;
    if (
      type === "ATTO_IMMOBILE" ||
      type === "PRELIMINARE_COMPRAVENDITA" ||
      type === "SCHEDE_CATASTALI" ||
      type === "CONTRATTO_AFFITTO" ||
      type === "APE"
    ) {
      return true;
    }
    const folder = (d.storageSubfolder ?? "").toUpperCase();
    if (folder.includes("IMMOBILE")) return true;
    const name = (d.renamedFileName ?? "").toLowerCase();
    if (
      name.includes("visura") ||
      name.includes("planimetria") ||
      name.includes("catast") ||
      name.includes("provenienza") ||
      name.includes("preliminare") ||
      name.includes("ape")
    ) {
      return true;
    }
    return false;
  };

  const withData = docs.filter((d) => d.extractedData && !isPropertyDoc(d));

  const fiscalCodes = withData
    .map((d) => d.extractedData?.fiscalCode?.toUpperCase().trim())
    .filter((c): c is string => Boolean(c && c.length >= 11));

  const uniqueCf = [...new Set(fiscalCodes)];
  if (uniqueCf.length > 1) {
    issues.push(
      `Codici fiscali non allineati tra i documenti: ${uniqueCf.join(", ")}`,
    );
  }

  const lastNames = withData
    .map((d) => d.extractedData?.lastName?.toUpperCase().trim())
    .filter((n): n is string => Boolean(n));

  const uniqueLast = [...new Set(lastNames)];
  if (uniqueLast.length > 1) {
    issues.push(
      `Cognomi non allineati tra i documenti: ${uniqueLast.join(", ")}`,
    );
  }

  return issues;
}
