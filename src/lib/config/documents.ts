import type { DocumentType, EmploymentType } from "@/db/schema";

/**
 * Testi ESATTI dal foglio Filippo "LISTA DOCUMENTI".
 * Non rinominare: le label UI devono coincidere col PDF.
 */

export type SheetChecklistItem = {
  /** Testo esatto della riga sul foglio */
  label: string;
  /** Tipi interni (es. 3 buste = 3 slot) */
  types: DocumentType[];
};

export type SheetSection = {
  title: string;
  subtitle?: string;
  items: SheetChecklistItem[];
};

/** Struttura foglio Filippo — ordine e scritte identiche */
export const SHEET_SECTIONS: SheetSection[] = [
  {
    title: "DOCUMENTAZIONE ANAGRAFICA",
    items: [
      { label: "CARTA DI IDENTITÀ FRONTE & RETRO", types: ["CARTA_IDENTITA"] },
      {
        label: "TESSERA SANITARIA FRONTE & RETRO",
        types: ["TESSERA_SANITARIA"],
      },
      { label: "PERMESSO DI SOGGIORNO", types: ["PERMESSO_SOGGIORNO"] },
      { label: "PASSAPORTO", types: ["PASSAPORTO"] },
      { label: "CERTIFICATO DI RESIDENZA", types: ["CERTIFICATO_RESIDENZA"] },
      { label: "STATO DI FAMIGLIA", types: ["STATO_FAMIGLIA"] },
      {
        label: "CERTIFICATO DI STATO LIBERO",
        types: ["CERTIFICATO_STATO_LIBERO"],
      },
      {
        label: "ESTRATTO PER RIASSUNTO DELL'ATTO DI MATRIMONIO",
        types: ["ATTO_MATRIMONIO"],
      },
      { label: "CERTIFICATO DI VEDOVANZA", types: ["CERTIFICATO_VEDOVANZA"] },
      { label: "OMOLOGA DELLA SEPARAZIONE", types: ["OMOLOGA_SEPARAZIONE"] },
      { label: "SENTENZA DIVORZIO", types: ["SENTENZA_DIVORZIO"] },
    ],
  },
  {
    title: "DOCUMENTAZIONE REDDITUALE",
    subtitle: "LAVORATORI DIPENDENTI",
    items: [
      {
        label: "ULTIME TRE BUSTE PAGA",
        types: ["BUSTA_PAGA_1", "BUSTA_PAGA_2", "BUSTA_PAGA_3"],
      },
      { label: "MODELLO CU 2024", types: ["MODELLO_CUD"] },
      { label: "730", types: ["MODELLO_730"] },
      { label: "CONTRATTO DI LAVORO", types: ["CONTRATTO_LAVORO"] },
      {
        label: "ESTRATTO CONTRIBUTIVO INPS",
        types: ["ESTRATTO_CONTRIBUTIVO_INPS"],
      },
      { label: "ULTIMO ESTRATTO CONTO UFFICIALE", types: ["ESTRATTO_CONTO"] },
      {
        label: "LISTA MOVIMENTI ULTIMI 3 MESI",
        types: ["LISTA_MOVIMENTI_3_MESI"],
      },
      { label: "ISEE", types: ["ISEE"] },
    ],
  },
  {
    title: "DOCUMENTAZIONE REDDITUALE",
    subtitle: "LAVORATORI AUTONOMI",
    items: [
      {
        label: "ULTIMI 2 MODELLI UNICI COMPLETI DI TRASMISSIONE TELEMATICA",
        types: ["MODELLO_UNICO_1", "MODELLO_UNICO_2"],
      },
      {
        label: "ISCRIZIONE ALLA CAMERA DI COMMERCIO",
        types: ["VISURA_CAMERALE"],
      },
      {
        label: "CERTIFICATO ATTRIBUZIONE PARTITA IVA",
        types: ["CERTIFICATO_PIVA"],
      },
      { label: "BILANCINO GESTIONE CORRENTE", types: ["BILANCINO"] },
      {
        label: "FATTURE EMESSE GESTIONE CORRENTE",
        types: ["FATTURE_EMESSE"],
      },
      {
        label: "NUMERO TELEFONO COMMERCIALISTA",
        types: ["NUMERO_TELEFONO_COMMERCIALISTA"],
      },
      { label: "ULTIMO ESTRATTO CONTO UFFICIALE", types: ["ESTRATTO_CONTO"] },
      {
        label: "LISTA MOVIMENTI ULTIMI 3 MESI",
        types: ["LISTA_MOVIMENTI_3_MESI"],
      },
    ],
  },
  {
    title: "DOCUMENTAZIONE REDDITUALE",
    subtitle: "PENSIONATI",
    items: [
      { label: "MODELLO CU 2024", types: ["MODELLO_CUD"] },
      { label: "730", types: ["MODELLO_730"] },
      { label: "ULTIMO ESTRATTO CONTO UFFICIALE", types: ["ESTRATTO_CONTO"] },
      {
        label: "LISTA MOVIMENTI ULTIMI 3 MESI",
        types: ["LISTA_MOVIMENTI_3_MESI"],
      },
      { label: "MODELLO OBIS", types: ["MODELLO_OBIS_M"] },
    ],
  },
  {
    title: "ULTERIORE DOCUMENTAZIONE",
    items: [
      { label: "CONTRATTO D'AFFITTO", types: ["CONTRATTO_AFFITTO"] },
      {
        label: "PRELIMINARE DI COMPRAVENDITA O PROPOSTA D'ACQUISTO",
        types: ["PRELIMINARE_COMPRAVENDITA"],
      },
      {
        label: "ATTO DI PROVENIENZA CASA DI PROPRIETÀ",
        types: ["ATTO_IMMOBILE"],
      },
      { label: "SCHEDE CATASTALI", types: ["SCHEDE_CATASTALI"] },
      {
        label: "EVENTUALI POLIZZE ASSICURATIVE O STRUMENTI DI RISPARMIO",
        types: ["POLIZZE_RISPARMIO"],
      },
      { label: "CONTRATTI DI FINANZIAMENTO", types: ["CONTRATTI_FINANZIAMENTO"] },
      {
        label: "ULTIMA QUIETANZA RATA MUTUO",
        types: ["QUIETANZA_RATA_MUTUO"],
      },
    ],
  },
];

/** Label esatte per ogni tipo (stesso testo del foglio). */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CARTA_IDENTITA: "CARTA DI IDENTITÀ FRONTE & RETRO",
  TESSERA_SANITARIA: "TESSERA SANITARIA FRONTE & RETRO",
  PERMESSO_SOGGIORNO: "PERMESSO DI SOGGIORNO",
  PASSAPORTO: "PASSAPORTO",
  CERTIFICATO_RESIDENZA: "CERTIFICATO DI RESIDENZA",
  STATO_FAMIGLIA: "STATO DI FAMIGLIA",
  CERTIFICATO_STATO_LIBERO: "CERTIFICATO DI STATO LIBERO",
  ATTO_MATRIMONIO: "ESTRATTO PER RIASSUNTO DELL'ATTO DI MATRIMONIO",
  CERTIFICATO_VEDOVANZA: "CERTIFICATO DI VEDOVANZA",
  OMOLOGA_SEPARAZIONE: "OMOLOGA DELLA SEPARAZIONE",
  SENTENZA_DIVORZIO: "SENTENZA DIVORZIO",
  BUSTA_PAGA_1: "ULTIME TRE BUSTE PAGA",
  BUSTA_PAGA_2: "ULTIME TRE BUSTE PAGA",
  BUSTA_PAGA_3: "ULTIME TRE BUSTE PAGA",
  MODELLO_CUD: "MODELLO CU 2024",
  MODELLO_730: "730",
  CUD_730: "MODELLO CU 2024",
  CONTRATTO_LAVORO: "CONTRATTO DI LAVORO",
  ESTRATTO_CONTRIBUTIVO_INPS: "ESTRATTO CONTRIBUTIVO INPS",
  ISEE: "ISEE",
  MODELLO_UNICO: "ULTIMI 2 MODELLI UNICI COMPLETI DI TRASMISSIONE TELEMATICA",
  MODELLO_UNICO_1: "ULTIMI 2 MODELLI UNICI COMPLETI DI TRASMISSIONE TELEMATICA",
  MODELLO_UNICO_2: "ULTIMI 2 MODELLI UNICI COMPLETI DI TRASMISSIONE TELEMATICA",
  VISURA_CAMERALE: "ISCRIZIONE ALLA CAMERA DI COMMERCIO",
  CERTIFICATO_PIVA: "CERTIFICATO ATTRIBUZIONE PARTITA IVA",
  BILANCINO: "BILANCINO GESTIONE CORRENTE",
  FATTURE_EMESSE: "FATTURE EMESSE GESTIONE CORRENTE",
  NUMERO_TELEFONO_COMMERCIALISTA: "NUMERO TELEFONO COMMERCIALISTA",
  F24: "F24",
  CEDOLINO_PENSIONE: "MODELLO OBIS",
  MODELLO_OBIS_M: "MODELLO OBIS",
  ESTRATTO_CONTO: "ULTIMO ESTRATTO CONTO UFFICIALE",
  LISTA_MOVIMENTI_3_MESI: "LISTA MOVIMENTI ULTIMI 3 MESI",
  CONTRATTO_AFFITTO: "CONTRATTO D'AFFITTO",
  PRELIMINARE_COMPRAVENDITA:
    "PRELIMINARE DI COMPRAVENDITA O PROPOSTA D'ACQUISTO",
  ATTO_IMMOBILE: "ATTO DI PROVENIENZA CASA DI PROPRIETÀ",
  SCHEDE_CATASTALI: "SCHEDE CATASTALI",
  POLIZZE_RISPARMIO:
    "EVENTUALI POLIZZE ASSICURATIVE O STRUMENTI DI RISPARMIO",
  CONTRATTI_FINANZIAMENTO: "CONTRATTI DI FINANZIAMENTO",
  QUIETANZA_RATA_MUTUO: "ULTIMA QUIETANZA RATA MUTUO",
  SCONOSCIUTO: "SCONOSCIUTO",
};

/** @deprecated usa SHEET_SECTIONS */
export const CHECKLIST_GROUPS = SHEET_SECTIONS.map((s) => ({
  id: `${s.title}-${s.subtitle ?? "main"}`,
  title: s.subtitle ? `${s.title} — ${s.subtitle}` : s.title,
  types: s.items.flatMap((i) => i.types),
}));

export const CHECKLIST_DOCUMENT_TYPES: DocumentType[] = [
  ...new Set(SHEET_SECTIONS.flatMap((s) => s.items.flatMap((i) => i.types))),
];

/**
 * Collassa i tipi richiesti nelle righe del foglio (es. 3 buste → 1 riga).
 */
export function sheetRowsForRequired(required: DocumentType[]): Array<{
  label: string;
  types: DocumentType[];
}> {
  const req = new Set(required);
  const rows: Array<{ label: string; types: DocumentType[] }> = [];
  const seen = new Set<string>();

  for (const section of SHEET_SECTIONS) {
    for (const item of section.items) {
      const matched = item.types.filter((t) => req.has(t));
      if (matched.length === 0) continue;
      const key = `${item.label}::${item.types.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ label: item.label, types: matched });
    }
  }

  // Tipi non mappati sul foglio (legacy)
  for (const t of required) {
    if (rows.some((r) => r.types.includes(t))) continue;
    rows.push({ label: DOCUMENT_TYPE_LABELS[t] ?? t, types: [t] });
  }

  return rows;
}

export const CHECKLIST_PRESETS: Record<EmploymentType, DocumentType[]> = {
  DIPENDENTE_INDETERMINATO: [
    "CARTA_IDENTITA",
    "TESSERA_SANITARIA",
    ...SHEET_SECTIONS.find((s) => s.subtitle === "LAVORATORI DIPENDENTI")!.items.flatMap(
      (i) => i.types,
    ),
  ],
  PARTITA_IVA: [
    "CARTA_IDENTITA",
    "TESSERA_SANITARIA",
    ...SHEET_SECTIONS.find((s) => s.subtitle === "LAVORATORI AUTONOMI")!.items.flatMap(
      (i) => i.types,
    ),
  ],
  PENSIONATO: [
    "CARTA_IDENTITA",
    "TESSERA_SANITARIA",
    ...SHEET_SECTIONS.find((s) => s.subtitle === "PENSIONATI")!.items.flatMap(
      (i) => i.types,
    ),
  ],
  ALTRO: ["CARTA_IDENTITA", "TESSERA_SANITARIA"],
};

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
  MODELLO_CUD: "23_CU",
  MODELLO_730: "24_730",
  CUD_730: "23_CU",
  CONTRATTO_LAVORO: "25_ContrattoLavoro",
  ESTRATTO_CONTRIBUTIVO_INPS: "26_EstrattoINPS",
  ISEE: "27_ISEE",
  MODELLO_UNICO: "30_Unico",
  MODELLO_UNICO_1: "30_Unico1",
  MODELLO_UNICO_2: "31_Unico2",
  VISURA_CAMERALE: "32_CameraCommercio",
  CERTIFICATO_PIVA: "33_CertPIVA",
  BILANCINO: "34_Bilancino",
  FATTURE_EMESSE: "35_Fatture",
  NUMERO_TELEFONO_COMMERCIALISTA: "36_TelCommercialista",
  F24: "36_F24",
  CEDOLINO_PENSIONE: "40_CedolinoPensione",
  MODELLO_OBIS_M: "41_OBIS",
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

/** Nomi sezioni foglio (preset) */
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  DIPENDENTE_INDETERMINATO: "LAVORATORI DIPENDENTI",
  PARTITA_IVA: "LAVORATORI AUTONOMI",
  PENSIONATO: "PENSIONATI",
  ALTRO: "DOCUMENTAZIONE ANAGRAFICA",
};

export const BANK_MANUAL_STATUSES = [
  "INVIATA_IN_BANCA",
  "PERITO_NOMINATO",
  "DELIBERATA",
] as const;
