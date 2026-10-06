import type { Document, DocumentType, EmploymentType } from "@/db/schema";
import { CHECKLIST_PRESETS } from "@/lib/config/documents";

export type ChecklistResult = {
  required: DocumentType[];
  presentValid: DocumentType[];
  missing: DocumentType[];
  invalid: DocumentType[];
  completedCount: number;
  totalRequired: number;
  isComplete: boolean;
  /** true se il broker non ha ancora impostato la checklist per questa pratica */
  isUnset: boolean;
  progressLabel: string;
};

/** Deduce il profilo lavorativo dai tipi documento presenti (solo hint / preset). */
export function inferEmploymentType(
  docs: Pick<Document, "documentType">[],
): EmploymentType {
  const types = new Set(docs.map((d) => d.documentType));

  if (types.has("CEDOLINO_PENSIONE") || types.has("MODELLO_OBIS_M")) {
    return "PENSIONATO";
  }
  if (
    types.has("MODELLO_UNICO") ||
    types.has("MODELLO_UNICO_1") ||
    types.has("MODELLO_UNICO_2") ||
    types.has("F24") ||
    types.has("VISURA_CAMERALE") ||
    types.has("CERTIFICATO_PIVA") ||
    types.has("BILANCINO") ||
    types.has("FATTURE_EMESSE")
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

type ChecklistDoc = {
  documentType: DocumentType;
  isValid: boolean;
  extractedData?: { alsoCovers?: DocumentType[] | null } | null;
};

function coveredTypes(
  docs: ChecklistDoc[],
): { valid: Set<DocumentType>; present: Set<DocumentType> } {
  const valid = new Set<DocumentType>();
  const present = new Set<DocumentType>();

  for (const d of docs) {
    if (d.documentType && d.documentType !== "SCONOSCIUTO") {
      present.add(d.documentType);
      if (d.isValid) valid.add(d.documentType);
    }
    const extra = d.extractedData?.alsoCovers ?? [];
    for (const t of extra) {
      if (!t || t === "SCONOSCIUTO") continue;
      present.add(t);
      if (d.isValid) valid.add(t);
    }
  }
  return { valid, present };
}

/**
 * Checklist per pratica: usa solo i tipi segnati su quella pratica.
 * Un file può coprire più voci via extractedData.alsoCovers.
 */
export function evaluateChecklist(
  requiredTypes: DocumentType[] | null | undefined,
  docs: ChecklistDoc[],
): ChecklistResult {
  const required = (requiredTypes ?? []).filter(
    (t) => t && t !== "SCONOSCIUTO",
  );
  const isUnset = required.length === 0;

  const { valid: validTypes, present: presentTypes } = coveredTypes(docs);

  const presentValid = required.filter((t) => validTypes.has(t));
  const missing = required.filter((t) => !presentTypes.has(t));
  const invalid = required.filter(
    (t) => presentTypes.has(t) && !validTypes.has(t),
  );

  const completedCount = presentValid.length;
  const totalRequired = required.length;
  const isComplete = !isUnset && completedCount === totalRequired;

  return {
    required,
    presentValid,
    missing,
    invalid,
    completedCount,
    totalRequired,
    isComplete,
    isUnset,
    progressLabel: isUnset
      ? "Seleziona i documenti richiesti"
      : `${completedCount}/${totalRequired}${isComplete ? " Completa" : ""}`,
  };
}

/** @deprecated usa evaluateChecklist(requiredTypes, docs) */
export function evaluateChecklistByEmployment(
  employmentType: EmploymentType,
  docs: ChecklistDoc[],
) {
  return evaluateChecklist(CHECKLIST_PRESETS[employmentType] ?? [], docs);
}

export function deriveApplicationStatus(
  requiredTypes: DocumentType[] | null | undefined,
  docs: ChecklistDoc[],
  currentStatus: string,
): "DOCUMENTI_INCOMPLETI" | "COMPLETA_DA_INOLTRARE" | null {
  if (
    [
      "INVIATA_A_SEGRETERIA",
      "DELIBERA_REDDITUALE",
      "PERIZIA_PRESA",
      "PERIZIA_EFFETTUATA",
      "DELIBERA_FINALE",
      "ROGITATA",
      "INVIATA_IN_BANCA",
      "PERITO_NOMINATO",
      "DELIBERATA",
    ].includes(currentStatus)
  ) {
    return null;
  }

  const checklist = evaluateChecklist(requiredTypes, docs);
  if (checklist.isComplete) return "COMPLETA_DA_INOLTRARE";
  return "DOCUMENTI_INCOMPLETI";
}
