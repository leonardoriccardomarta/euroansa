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

/** Deduce il profilo lavorativo dai tipi documento presenti. */
export function inferEmploymentType(
  docs: Pick<Document, "documentType">[],
): EmploymentType {
  const types = new Set(docs.map((d) => d.documentType));

  if (types.has("CEDOLINO_PENSIONE")) return "PENSIONATO";
  if (
    types.has("MODELLO_UNICO") ||
    types.has("F24") ||
    types.has("VISURA_CAMERALE")
  ) {
    return "PARTITA_IVA";
  }
  if (
    types.has("BUSTA_PAGA_1") ||
    types.has("BUSTA_PAGA_2") ||
    types.has("BUSTA_PAGA_3")
  ) {
    return "DIPENDENTE_INDETERMINATO";
  }
  return "DIPENDENTE_INDETERMINATO";
}

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
    progressLabel: `${completedCount}/${totalRequired}${isComplete ? " Completa" : ""}`,
  };
}

export function deriveApplicationStatus(
  employmentType: EmploymentType,
  docs: Pick<Document, "documentType" | "isValid">[],
  currentStatus: string,
): "DOCUMENTI_INCOMPLETI" | "COMPLETA_DA_INOLTRARE" | null {
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
  return "DOCUMENTI_INCOMPLETI";
}
