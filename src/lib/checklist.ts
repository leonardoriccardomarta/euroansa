import type { Document, DocumentType, EmploymentType } from "@/db/schema";
import {
  CHECKLIST_PRESETS,
  expandMultiSlotTypes,
  getCoupleApplicantNames,
  resolveApplicantFolders,
  storageFolderKindForDocument,
} from "@/lib/config/documents";

export type ChecklistResult = {
  required: DocumentType[];
  presentValid: DocumentType[];
  /** Presenti in pratica (anche se AI li ha bocciati — Filippo rivede sotto). */
  present: DocumentType[];
  missing: DocumentType[];
  invalid: DocumentType[];
  completedCount: number;
  totalRequired: number;
  /** Tutti i tipi presenti E validi (pronti per invio senza avvisi). */
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

export type ChecklistDoc = {
  documentType: DocumentType;
  isValid: boolean;
  extractedData?: {
    alsoCovers?: DocumentType[] | null;
    fiscalCode?: string | null;
    [key: string]: unknown;
  } | null;
  storageSubfolder?: string | null;
  rawFileName?: string | null;
  renamedFileName?: string | null;
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
  const required = expandMultiSlotTypes(
    (requiredTypes ?? []).filter((t) => t && t !== "SCONOSCIUTO"),
  );
  const isUnset = required.length === 0;

  const { valid: validTypes, present: presentTypes } = coveredTypes(docs);

  const presentValid = required.filter((t) => validTypes.has(t));
  const present = required.filter((t) => presentTypes.has(t));
  const missing = required.filter((t) => !presentTypes.has(t));
  const invalid = required.filter(
    (t) => presentTypes.has(t) && !validTypes.has(t),
  );

  // Progress: conta anche i file “da rivedere” (presenti ma non validi)
  const completedCount = present.length;
  const totalRequired = required.length;
  const isComplete =
    !isUnset &&
    present.length === totalRequired &&
    invalid.length === 0;

  return {
    required,
    presentValid,
    present,
    missing,
    invalid,
    completedCount,
    totalRequired,
    isComplete,
    isUnset,
    progressLabel: isUnset
      ? "Seleziona i documenti richiesti"
      : invalid.length > 0
        ? `${completedCount}/${totalRequired} (da rivedere: ${invalid.length})`
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

export type CoupleChecklistEvaluation = {
  applicant1: ChecklistResult & { name: string; folder: string };
  applicant2: ChecklistResult & { name: string; folder: string };
  immobile: ChecklistResult & { folder: string };
  overall: ChecklistResult;
};

/**
 * Checklist sdoppiata per pratiche Coppia / Cointestatari.
 * Separa la verifica anagrafica e reddituale tra Richiedente 1 e 2,
 * e mantiene condivisi i requisiti relativi all'immobile/pratica.
 */
export function evaluateCoupleChecklist(params: {
  requiredTypes: DocumentType[] | null | undefined;
  docs: ChecklistDoc[];
  clientName: string;
  coApplicantName?: string | null;
  clientFiscalCode?: string | null;
  coApplicantFiscalCode?: string | null;
  folders?: string[];
}): CoupleChecklistEvaluation {
  const {
    requiredTypes,
    docs,
    clientName,
    coApplicantName,
    clientFiscalCode,
    coApplicantFiscalCode,
    folders = [],
  } = params;

  const { applicant1: name1, applicant2: name2 } = getCoupleApplicantNames(
    clientName,
    coApplicantName,
  );
  const { applicant1Folder, applicant2Folder, immobileFolder } =
    resolveApplicantFolders(folders, clientName, coApplicantName);

  const cf1 = clientFiscalCode?.trim().toUpperCase();
  // NEVER copy CF1 to CF2
  const cf2 =
    coApplicantFiscalCode && coApplicantFiscalCode.trim().toUpperCase() !== cf1
      ? coApplicantFiscalCode.trim().toUpperCase()
      : undefined;

  const allRequired = expandMultiSlotTypes(
    (requiredTypes ?? []).filter((t) => t && t !== "SCONOSCIUTO"),
  );

  const personalRequired = allRequired.filter(
    (t) => storageFolderKindForDocument(t) === "DOC",
  );
  const immobileRequired = allRequired.filter(
    (t) => storageFolderKindForDocument(t) === "IMMOBILE",
  );

  const app1Docs: ChecklistDoc[] = [];
  const app2Docs: ChecklistDoc[] = [];
  const immobileDocs: ChecklistDoc[] = [];

  for (const doc of docs) {
    const kind = storageFolderKindForDocument(doc.documentType);
    const subfolder = (doc.storageSubfolder ?? "").trim().toUpperCase();
    const docCf = doc.extractedData?.fiscalCode?.trim().toUpperCase();

    if (
      kind === "IMMOBILE" ||
      subfolder === immobileFolder.toUpperCase() ||
      /immobile/i.test(subfolder)
    ) {
      immobileDocs.push(doc);
      continue;
    }

    if (
      (cf2 && docCf === cf2) ||
      subfolder === applicant2Folder.toUpperCase() ||
      /richiedente\s*2/i.test(subfolder)
    ) {
      app2Docs.push(doc);
      continue;
    }

    if (
      (cf1 && docCf === cf1) ||
      subfolder === applicant1Folder.toUpperCase() ||
      /richiedente\s*1/i.test(subfolder)
    ) {
      app1Docs.push(doc);
      continue;
    }

    // Fallback: cerca occorrenza di cognome/nome nei nomi file
    const docName = (doc.renamedFileName || doc.rawFileName || "").toLowerCase();
    const name2Parts = name2
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length > 2);
    if (name2Parts.length > 0 && name2Parts.some((p) => docName.includes(p))) {
      app2Docs.push(doc);
    } else {
      app1Docs.push(doc);
    }
  }

  const app1Result = evaluateChecklist(personalRequired, app1Docs);
  const app2Result = evaluateChecklist(personalRequired, app2Docs);
  const immResult = evaluateChecklist(immobileRequired, immobileDocs);

  const totalReq =
    app1Result.totalRequired +
    app2Result.totalRequired +
    immResult.totalRequired;
  const completed =
    app1Result.completedCount +
    app2Result.completedCount +
    immResult.completedCount;
  const totalInvalid =
    app1Result.invalid.length +
    app2Result.invalid.length +
    immResult.invalid.length;

  const isUnset = totalReq === 0;
  const isComplete =
    !isUnset &&
    app1Result.isComplete &&
    app2Result.isComplete &&
    (immobileRequired.length === 0 || immResult.isComplete);

  const progressLabel = isUnset
    ? "Seleziona i documenti richiesti"
    : totalInvalid > 0
      ? `${completed}/${totalReq} (da rivedere: ${totalInvalid})`
      : `${completed}/${totalReq}${isComplete ? " Completa" : ""}`;

  const overall: ChecklistResult = {
    required: [
      ...app1Result.required,
      ...app2Result.required,
      ...immResult.required,
    ],
    presentValid: [
      ...app1Result.presentValid,
      ...app2Result.presentValid,
      ...immResult.presentValid,
    ],
    present: [
      ...app1Result.present,
      ...app2Result.present,
      ...immResult.present,
    ],
    missing: [
      ...app1Result.missing,
      ...app2Result.missing,
      ...immResult.missing,
    ],
    invalid: [
      ...app1Result.invalid,
      ...app2Result.invalid,
      ...immResult.invalid,
    ],
    completedCount: completed,
    totalRequired: totalReq,
    isComplete,
    isUnset,
    progressLabel,
  };

  return {
    applicant1: { ...app1Result, name: name1, folder: applicant1Folder },
    applicant2: { ...app2Result, name: name2, folder: applicant2Folder },
    immobile: { ...immResult, folder: immobileFolder },
    overall,
  };
}

export function deriveApplicationStatus(
  requiredTypes: DocumentType[] | null | undefined,
  docs: ChecklistDoc[],
  currentStatus: string,
  coupleOptions?: {
    isCouple?: boolean;
    clientName?: string;
    coApplicantName?: string | null;
    clientFiscalCode?: string | null;
    coApplicantFiscalCode?: string | null;
    folders?: string[];
  },
): "DOCUMENTI_INCOMPLETI" | "COMPLETA_DA_INOLTRARE" | null {
  if (
    [
      "INVIATA_IN_BANCA",
      "DELIBERATA",
      "PERIZIA_INCARICATA",
      "PREPARAZIONE_ATTO",
      "DELIBERA_FINALE",
      "ROGITATA",
      "IN_ATTESA_RISCONTRO_CLIENTE",
      // Legacy
      "INVIATA_A_SEGRETERIA",
      "DELIBERA_REDDITUALE",
      "PERIZIA_PRESA",
      "PERIZIA_EFFETTUATA",
      "PERITO_NOMINATO",
    ].includes(currentStatus)
  ) {
    return null;
  }

  if (coupleOptions?.isCouple && coupleOptions.clientName) {
    const coupleRes = evaluateCoupleChecklist({
      requiredTypes,
      docs,
      clientName: coupleOptions.clientName,
      coApplicantName: coupleOptions.coApplicantName,
      clientFiscalCode: coupleOptions.clientFiscalCode,
      coApplicantFiscalCode: coupleOptions.coApplicantFiscalCode,
      folders: coupleOptions.folders,
    });
    if (coupleRes.overall.isComplete) return "COMPLETA_DA_INOLTRARE";
    return "DOCUMENTI_INCOMPLETI";
  }

  const checklist = evaluateChecklist(requiredTypes, docs);
  if (checklist.isComplete) return "COMPLETA_DA_INOLTRARE";
  return "DOCUMENTI_INCOMPLETI";
}
