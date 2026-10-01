import type { DocumentType, EmploymentType } from "@/db/schema";

/**
 * Config documenti Euroansa.
 *
 * Confermato Filippo:
 * - Checklist NON fissa: ogni pratica/banca richiede documenti diversi.
 *   Il broker seleziona i richiesti per pratica (dashboard) o parte da un preset.
 * - Q1 ownership: ADMIN vede tutte; broker solo le proprie
 * - Multiuser Google: OAuth per utente → casella/Drive propri
 * - Q3 validità documenti (scaduti, illeggibili, CIG, ecc.)
 * - Q5 Drive sottocartelle
 * - Q6 oggetto mail: [EUROANSA-MUTUO]
 */

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CARTA_IDENTITA: "Carta d'identità",
  TESSERA_SANITARIA: "Tessera sanitaria / CF",
  BUSTA_PAGA_1: "Busta paga 1",
  BUSTA_PAGA_2: "Busta paga 2",
  BUSTA_PAGA_3: "Busta paga 3",
  CUD_730: "CUD / 730",
  ATTO_IMMOBILE: "Atto immobile",
  CEDOLINO_PENSIONE: "Cedolino pensione",
  MODELLO_UNICO: "Modello Unico",
  F24: "F24",
  VISURA_CAMERALE: "Visura camerale",
  SCONOSCIUTO: "Documento non riconosciuto",
};

/** Tipi selezionabili in checklist (escluso SCONOSCIUTO). */
export const CHECKLIST_DOCUMENT_TYPES: DocumentType[] = [
  "CARTA_IDENTITA",
  "TESSERA_SANITARIA",
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
  "CUD_730",
  "CEDOLINO_PENSIONE",
  "MODELLO_UNICO",
  "F24",
  "ATTO_IMMOBILE",
  "VISURA_CAMERALE",
];

/**
 * Solo preset di partenza (opzionali).
 * NON sono la verità automatica: ogni pratica ha la sua lista.
 */
export const CHECKLIST_PRESETS: Record<EmploymentType, DocumentType[]> = {
  DIPENDENTE_INDETERMINATO: [
    "CARTA_IDENTITA",
    "TESSERA_SANITARIA",
    "BUSTA_PAGA_1",
    "BUSTA_PAGA_2",
    "BUSTA_PAGA_3",
    "CUD_730",
  ],
  PARTITA_IVA: [
    "CARTA_IDENTITA",
    "TESSERA_SANITARIA",
    "MODELLO_UNICO",
    "F24",
    "CUD_730",
  ],
  PENSIONATO: [
    "CARTA_IDENTITA",
    "TESSERA_SANITARIA",
    "CEDOLINO_PENSIONE",
    "CUD_730",
  ],
  ALTRO: ["CARTA_IDENTITA", "TESSERA_SANITARIA"],
};

/** @deprecated usa CHECKLIST_PRESETS */
export const REQUIRED_DOCS_BY_EMPLOYMENT = CHECKLIST_PRESETS;

/** Cartella root cliente: "{Nome} - Mutuo ({id8})" */
export const DRIVE_FOLDER_TEMPLATE = "{CognomeNome} - Mutuo";

/** Sottocartelle Drive (Filippo) — con numerazione */
export const DRIVE_SUBFOLDERS = [
  "01_doc clienti",
  "02_banca",
  "03_immobile",
  "04_euroansa",
] as const;

export type DriveSubfolder = (typeof DRIVE_SUBFOLDERS)[number];

export function driveSubfolderForDocument(type: DocumentType): DriveSubfolder {
  if (type === "ATTO_IMMOBILE") return "03_immobile";
  // Estratti conto / lista movimenti (quando tipizzati) → 02_banca
  return "01_doc clienti";
}

/** Provvisorio — template finali venerdì da Filippo */
export const FILE_NAME_PREFIX: Record<DocumentType, string> = {
  CARTA_IDENTITA: "01_DocIdentita",
  TESSERA_SANITARIA: "02_TesseraSanitaria",
  BUSTA_PAGA_1: "03_BustaPaga",
  BUSTA_PAGA_2: "04_BustaPaga",
  BUSTA_PAGA_3: "05_BustaPaga",
  CUD_730: "06_CUD730",
  CEDOLINO_PENSIONE: "03_CedolinoPensione",
  MODELLO_UNICO: "03_ModelloUnico",
  F24: "04_F24",
  ATTO_IMMOBILE: "07_AttoImmobile",
  VISURA_CAMERALE: "08_VisuraCamerale",
  SCONOSCIUTO: "99_Sconosciuto",
};

export const MAX_INSTALLMENT_RATIO = 0.35;

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  DOCUMENTI_INCOMPLETI: "Documenti incompleti",
  COMPLETA_DA_INOLTRARE: "Completa da inoltrare",
  INVIATA_A_SEGRETERIA: "Inviata a segreteria",
  INVIATA_IN_BANCA: "Inviata in banca",
  PERITO_NOMINATO: "Perito nominato",
  DELIBERATA: "Deliberata",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  DIPENDENTE_INDETERMINATO: "Dipendente indeterminato",
  PARTITA_IVA: "Partita IVA",
  PENSIONATO: "Pensionato",
  ALTRO: "Altro",
};

export const BANK_MANUAL_STATUSES = [
  "INVIATA_IN_BANCA",
  "PERITO_NOMINATO",
  "DELIBERATA",
] as const;
