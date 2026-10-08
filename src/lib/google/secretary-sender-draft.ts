import { isEuroansaFolder } from "@/lib/config/documents";
import { PACKAGE_LINK_TTL_DAYS } from "@/lib/db/setup-statements";
import { isSiteStorageKey } from "@/lib/storage/paths";

/** Template mail segreteria (ok anche lato client per anteprima). */
export function buildSecretaryEmailDraft(params: {
  clientName: string;
  signature: string;
  packageUrl?: string;
}): { subject: string; bodyText: string } {
  const url = params.packageUrl?.trim() || "{{PACKAGE_URL}}";
  return {
    subject: `Pratica completa ${params.clientName}`,
    bodyText: `Buongiorno,

pratica ${params.clientName} pronta.

${url}

(Link valido ${PACKAGE_LINK_TTL_DAYS} giorni)

Grazie
${params.signature}`,
  };
}

/** Doc candidati al pacchetto segreteria (storage sito). */
export function isSecretaryPackageDoc(doc: {
  driveFileId: string | null;
  isValid: boolean;
  filePurged?: boolean | null;
  storageSubfolder?: string | null;
}): boolean {
  if (doc.filePurged) return false;
  if (!doc.driveFileId || !isSiteStorageKey(doc.driveFileId)) return false;
  return doc.isValid || isEuroansaFolder(doc.storageSubfolder ?? "");
}
