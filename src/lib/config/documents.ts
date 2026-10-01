import type { DocumentType, EmploymentType } from "@/db/schema";

/**
 * Lista documenti = foglio Filippo "LISTA DOCUMENTI".
 * Checklist per pratica (toggle); i 3 preset sono solo scorciatoie.
 */

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  // Anagrafica
  CARTA_IDENTITA: "Carta d'identità fronte & retro",
  TESSERA_SANITARIA: "Tessera sanitaria fronte & retro",
  PERMESSO_SOGGIORNO: "Permesso di soggiorno",
  PASSAPORTO: "Passaporto",
  CERTIFICATO_RESIDENZA: "Certificato di residenza",
  STATO_FAMIGLIA: "Stato di famiglia",
  CERTIFICATO_STATO_LIBERO: "Certificato di stato libero",
  ATTO_MATRIMONIO: "Estratto atto di matrimonio",
  CERTIFICATO_VEDOVANZA: "Certificato di vedovanza",
  OMOLOGA_SEPARAZIONE: "Omologa della separazione",
  SENTENZA_DIVORZIO: "Sentenza divorzio",
  // Dipendenti
  BUSTA_PAGA_1: "Busta paga 1 (ultima)",
  BUSTA_PAGA_2: "Busta paga 2",
  BUSTA_PAGA_3: "Busta paga 3",
  MODELLO_CUD: "Modello CUD",
  MODELLO_730: "Modello 730",
  CUD_730: "CUD / 730 (generico)",
  CONTRATTO_LAVORO: "Contratto di lavoro",
  ESTRATTO_CONTRIBUTIVO_INPS: "Estratto contributivo INPS",
  ISEE: "ISEE",
  // Autonomi
  MODELLO_UNICO: "Modello Unico",
  MODELLO_UNICO_1: "Modello Unico 1 (ultimo)",
  MODELLO_UNICO_2: "Modello Unico 2",
  VISURA_CAMERALE: "Iscrizione Camera di Commercio / visura",
  CERTIFICATO_PIVA: "Certificato attribuzione P.IVA",
  BILANCINO: "Bilancino gestione corrente",
  FATTURE_EMESSE: "Fatture emesse gestione corrente",
  F24: "F24",
  // Pensionati
  CEDOLINO_PENSIONE: "Cedolino pensione",
  MODELLO_OBIS_M: "Modello OBIS M",
  // Banca
  ESTRATTO_CONTO: "Ultimo estratto conto ufficiale",
  LISTA_MOVIMENTI_3_MESI: "Lista movimenti ultimi 3 mesi",
  // Ulteriore
  CONTRATTO_AFFITTO: "Contratto d'affitto",
  PRELIMINARE_COMPRAVENDITA: "Preliminare / proposta d'acquisto",
  ATTO_IMMOBILE: "Atto di provenienza casa di proprietà",
  SCHEDE_CATASTALI: "Schede catastali",
  POLIZZE_RISPARMIO: "Polizze assicurative / strumenti di risparmio",
  CONTRATTI_FINANZIAMENTO: "Contratti di finanziamento",
  QUIETANZA_RATA_MUTUO: "Ultima quietanza rata mutuo",
  SCONOSCIUTO: "Documento non riconosciuto",
};

export type ChecklistGroup = {
  id: string;
  title: string;
  types: DocumentType[];
};

/** Gruppi UI = sezioni del foglio Filippo */
export const CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    id: "anagrafica",
    title: "Documentazione anagrafica",
    types: [
      "CARTA_IDENTITA",
      "TESSERA_SANITARIA",
      "PERMESSO_SOGGIORNO",
      "PASSAPORTO",
      "CERTIFICATO_RESIDENZA",
      "STATO_FAMIGLIA",
      "CERTIFICATO_STATO_LIBERO",
      "ATTO_MATRIMONIO",
      "CERTIFICATO_VEDOVANZA",
      "OMOLOGA_SEPARAZIONE",
      "SENTENZA_DIVORZIO",
    ],
  },
  {
    id: "dipendenti",
    title: "Reddito — lavoratori dipendenti",
    types: [
      "BUSTA_PAGA_1",
      "BUSTA_PAGA_2",
      "BUSTA_PAGA_3",
      "MODELLO_CUD",
      "MODELLO_730",
      "CONTRATTO_LAVORO",
      "ESTRATTO_CONTRIBUTIVO_INPS",
      "ESTRATTO_CONTO",
      "LISTA_MOVIMENTI_3_MESI",
      "ISEE",
    ],
  },
  {
    id: "autonomi",
    title: "Reddito — lavoratori autonomi",
    types: [
      "MODELLO_UNICO_1",
      "MODELLO_UNICO_2",
      "VISURA_CAMERALE",
      "CERTIFICATO_PIVA",
      "BILANCINO",
      "FATTURE_EMESSE",
      "ESTRATTO_CONTO",
      "LISTA_MOVIMENTI_3_MESI",
      "F24",
    ],
  },
  {
    id: "pensionati",
    title: "Reddito — pensionati",
    types: [
      "MODELLO_CUD",
      "MODELLO_730",
      "ESTRATTO_CONTO",
      "LISTA_MOVIMENTI_3_MESI",
      "MODELLO_OBIS_M",
      "CEDOLINO_PENSIONE",
    ],
  },
  {
    id: "ulteriore",
    title: "Ulteriore documentazione",
    types: [
      "CONTRATTO_AFFITTO",
      "PRELIMINARE_COMPRAVENDITA",
      "ATTO_IMMOBILE",
      "SCHEDE_CATASTALI",
      "POLIZZE_RISPARMIO",
      "CONTRATTI_FINANZIAMENTO",
      "QUIETANZA_RATA_MUTUO",
    ],
  },
];

/** Tipi selezionabili (ordine foglio, senza duplicati di gruppo). */
export const CHECKLIST_DOCUMENT_TYPES: DocumentType[] = [
  ...new Set(CHECKLIST_GROUPS.flatMap((g) => g.types)),
];

const ANAGRAFICA_BASE: DocumentType[] = [
  "CARTA_IDENTITA",
  "TESSERA_SANITARIA",
];

/**
 * Preset scorciatoia (Filippo: dipendenti / autonomi / pensionati).
 * Poi si aggiungono/tolgono pezzi per banca/pratica.
 */
export const CHECKLIST_PRESETS: Record<EmploymentType, DocumentType[]> = {
  DIPENDENTE_INDETERMINATO: [
    ...ANAGRAFICA_BASE,
    "BUSTA_PAGA_1",
    "BUSTA_PAGA_2",
    "BUSTA_PAGA_3",
    "MODELLO_CUD",
    "MODELLO_730",
    "CONTRATTO_LAVORO",
    "ESTRATTO_CONTRIBUTIVO_INPS",
    "ESTRATTO_CONTO",
    "LISTA_MOVIMENTI_3_MESI",
    "ISEE",
  ],
  PARTITA_IVA: [
    ...ANAGRAFICA_BASE,
    "MODELLO_UNICO_1",
    "MODELLO_UNICO_2",
    "VISURA_CAMERALE",
    "CERTIFICATO_PIVA",
    "BILANCINO",
    "FATTURE_EMESSE",
    "ESTRATTO_CONTO",
    "LISTA_MOVIMENTI_3_MESI",
  ],
  PENSIONATO: [
    ...ANAGRAFICA_BASE,
    "MODELLO_CUD",
    "MODELLO_730",
    "ESTRATTO_CONTO",
    "LISTA_MOVIMENTI_3_MESI",
    "MODELLO_OBIS_M",
    "CEDOLINO_PENSIONE",
  ],
  ALTRO: [...ANAGRAFICA_BASE],
};

/** @deprecated */
export const REQUIRED_DOCS_BY_EMPLOYMENT = CHECKLIST_PRESETS;

export const DRIVE_FOLDER_TEMPLATE = "{CognomeNome} - Mutuo";

export const DRIVE_SUBFOLDERS = [
  "01_doc clienti",
  "02_banca",
  "03_immobile",
  "04_euroansa",
] as const;

export type DriveSubfolder = (typeof DRIVE_SUBFOLDERS)[number];

export function driveSubfolderForDocument(type: DocumentType): DriveSubfolder {
  if (
    type === "ESTRATTO_CONTO" ||
    type === "LISTA_MOVIMENTI_3_MESI" ||
    type === "CONTRATTI_FINANZIAMENTO" ||
    type === "QUIETANZA_RATA_MUTUO"
  ) {
    return "02_banca";
  }
  if (
    type === "ATTO_IMMOBILE" ||
    type === "PRELIMINARE_COMPRAVENDITA" ||
    type === "SCHEDE_CATASTALI" ||
    type === "CONTRATTO_AFFITTO"
  ) {
    return "03_immobile";
  }
  return "01_doc clienti";
}

export const FILE_NAME_PREFIX: Record<DocumentType, string> = {
  CARTA_IDENTITA: "01_CI",
  TESSERA_SANITARIA: "02_TS",
  PERMESSO_SOGGIORNO: "03_PermessoSoggiorno",
  PASSAPORTO: "04_Passaporto",
  CERTIFICATO_RESIDENZA: "05_Residenza",
  STATO_FAMIGLIA: "06_StatoFamiglia",
  CERTIFICATO_STATO_LIBERO: "07_StatoLibero",
  ATTO_MATRIMONIO: "08_Matrimonio",
  CERTIFICATO_VEDOVANZA: "09_Vedovanza",
  OMOLOGA_SEPARAZIONE: "10_Separazione",
  SENTENZA_DIVORZIO: "11_Divorzio",
  BUSTA_PAGA_1: "20_BustaPaga1",
  BUSTA_PAGA_2: "21_BustaPaga2",
  BUSTA_PAGA_3: "22_BustaPaga3",
  MODELLO_CUD: "23_CUD",
  MODELLO_730: "24_730",
  CUD_730: "23_CUD730",
  CONTRATTO_LAVORO: "25_ContrattoLavoro",
  ESTRATTO_CONTRIBUTIVO_INPS: "26_EstrattoINPS",
  ISEE: "27_ISEE",
  MODELLO_UNICO: "30_Unico",
  MODELLO_UNICO_1: "30_Unico1",
  MODELLO_UNICO_2: "31_Unico2",
  VISURA_CAMERALE: "32_VisuraCCIAA",
  CERTIFICATO_PIVA: "33_CertPIVA",
  BILANCINO: "34_Bilancino",
  FATTURE_EMESSE: "35_Fatture",
  F24: "36_F24",
  CEDOLINO_PENSIONE: "40_CedolinoPensione",
  MODELLO_OBIS_M: "41_OBISM",
  ESTRATTO_CONTO: "50_EstrattoConto",
  LISTA_MOVIMENTI_3_MESI: "51_ListaMovimenti",
  CONTRATTO_AFFITTO: "60_Affitto",
  PRELIMINARE_COMPRAVENDITA: "61_Preliminare",
  ATTO_IMMOBILE: "62_AttoProvenienza",
  SCHEDE_CATASTALI: "63_Catasto",
  POLIZZE_RISPARMIO: "64_Polizze",
  CONTRATTI_FINANZIAMENTO: "65_Finanziamenti",
  QUIETANZA_RATA_MUTUO: "66_QuietanzaMutuo",
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
  DIPENDENTE_INDETERMINATO: "Dipendenti",
  PARTITA_IVA: "Autonomi",
  PENSIONATO: "Pensionati",
  ALTRO: "Solo anagrafica",
};

export const BANK_MANUAL_STATUSES = [
  "INVIATA_IN_BANCA",
  "PERITO_NOMINATO",
  "DELIBERATA",
] as const;
