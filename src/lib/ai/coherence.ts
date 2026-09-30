import type { Document } from "@/db/schema";

export function checkAnagraphicCoherence(
  docs: Pick<Document, "extractedData" | "renamedFileName" | "isValid">[],
): string[] {
  const issues: string[] = [];
  const withData = docs.filter((d) => d.extractedData);

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
