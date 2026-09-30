import type { Document, DocumentType, EmploymentType } from "@/db/schema";
import { REQUIRED_DOCS_BY_EMPLOYMENT } from "@/lib/config/documents";

export type ChecklistResult = {
  required: DocumentType[];
  presentValid: DocumentType[];
  missing: DocumentType[];
  invalid: DocumentType[];
  completedCount: number;
  totalRequired: number;
  isComplete: boolean;
  progressLabel: string;
};

export function evaluateChecklist(
  employmentType: EmploymentType,
  docs: Pick<Document, "documentType" | "isValid">[],
): ChecklistResult {
  const required = REQUIRED_DOCS_BY_EMPLOYMENT[employmentType] ?? [];
  const validTypes = new Set(
    docs.filter((d) => d.isValid).map((d) => d.documentType),
  );
  const presentTypes = new Set(docs.map((d) => d.documentType));

  const presentValid = required.filter((t) => validTypes.has(t));
  const missing = required.filter((t) => !presentTypes.has(t));
  const invalid = required.filter(
    (t) => presentTypes.has(t) && !validTypes.has(t),
  );

  const completedCount = presentValid.length;
  const totalRequired = required.length;
  const isComplete = completedCount === totalRequired && totalRequired > 0;

  return {
    required,
    presentValid,
    missing,
    invalid,
    completedCount,
    totalRequired,
    isComplete,
    progressLabel: `${completedCount}/${totalRequired}${isComplete ? " — Completa" : ""}`,
  };
}

export function deriveApplicationStatus(
  employmentType: EmploymentType,
  docs: Pick<Document, "documentType" | "isValid">[],
  currentStatus: string,
):
  | "IN_ATTESA_DOCUMENTI"
  | "DOCUMENTI_INCOMPLETI"
  | "COMPLETA_DA_INOLTRARE"
  | "ANOMALIA"
  | null {
  // Non sovrascrivere stati post-segreteria / banca
  if (
    [
      "INVIATA_A_SEGRETERIA",
      "INVIATA_IN_BANCA",
      "PERITO_NOMINATO",
      "DELIBERATA",
    ].includes(currentStatus)
  ) {
    return null;
  }

  const checklist = evaluateChecklist(employmentType, docs);
  if (checklist.isComplete) return "COMPLETA_DA_INOLTRARE";
  if (docs.length === 0) return "IN_ATTESA_DOCUMENTI";
  return "DOCUMENTI_INCOMPLETI";
}
