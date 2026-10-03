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

/**
 * Cartelle storage predefinite per pratica cliente.
 *   {Cliente}/
 *     {COGNOME} DOC/
 *     BANCA/
 *     IMMOBILE/
 *     EUROANSA/
 *     {Cliente}_relazione.pdf
 */
export const STORAGE_FOLDER_KINDS = [
  "DOC",
  "BANCA",
  "IMMOBILE",
  "EUROANSA",
] as const;

export type StorageFolderKind = (typeof STORAGE_FOLDER_KINDS)[number];

/** Cognome breve dal nome cliente (es. "MOHAMED ALI" → "ALI") */
export function clientSurnameShort(clientName: string): string {
  const parts = clientName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/[^a-zA-ZàèéìòùÀÈÉÌÒÙ']/g, ""));
  if (parts.length === 0) return "CLIENTE";
  return (parts[parts.length - 1] || parts[0]!).toUpperCase();
}

export function storageSubfolderLabel(
  kind: StorageFolderKind,
  clientName: string,
): string {
  if (kind === "DOC") return `${clientSurnameShort(clientName)} DOC`;
  return kind;
}

/** Cartelle iniziali di una pratica */
export function defaultStorageFolders(clientName: string): string[] {
  return STORAGE_FOLDER_KINDS.map((k) => storageSubfolderLabel(k, clientName));
}

export function sanitizeFolderName(name: string): string {
  return name
    .trim()
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function storageFolderKindForDocument(
  type: DocumentType,
): StorageFolderKind {
  if (
    type === "ESTRATTO_CONTO" ||
    type === "LISTA_MOVIMENTI_3_MESI" ||
    type === "CONTRATTI_FINANZIAMENTO" ||
    type === "QUIETANZA_RATA_MUTUO"
  ) {
    return "BANCA";
  }
  if (
    type === "ATTO_IMMOBILE" ||
    type === "PRELIMINARE_COMPRAVENDITA" ||
    type === "SCHEDE_CATASTALI" ||
    type === "CONTRATTO_AFFITTO"
  ) {
    return "IMMOBILE";
  }
  return "DOC";
}

/** Alias legacy (Drive rimosso → storage sito) */
export const DRIVE_SUBFOLDERS = [
  "DOC",
  "BANCA",
  "IMMOBILE",
  "EUROANSA",
] as const;
export type DriveSubfolder = StorageFolderKind;
export const driveSubfolderForDocument = storageFolderKindForDocument;

/**
 * Prefissi stile Filippo: ALI_ci.pdf, ALI_bp 05.pdf, ALI_cud 26.pdf
 */
export const FILE_NAME_PREFIX: Record<DocumentType, string> = {
  CARTA_IDENTITA: "ci",
  TESSERA_SANITARIA: "tessera sanitaria",
  PERMESSO_SOGGIORNO: "permesso soggiorno",
  PASSAPORTO: "passaporto",
  CERTIFICATO_RESIDENZA: "certificato di residenza",
  STATO_FAMIGLIA: "stato famiglia",
  CERTIFICATO_STATO_LIBERO: "stato libero",
  ATTO_MATRIMONIO: "atto matrimonio",
  CERTIFICATO_VEDOVANZA: "vedovanza",
  OMOLOGA_SEPARAZIONE: "separazione",
  SENTENZA_DIVORZIO: "divorzio",
  BUSTA_PAGA_1: "bp",
  BUSTA_PAGA_2: "bp",
  BUSTA_PAGA_3: "bp",
  MODELLO_CUD: "cud",
  MODELLO_730: "730",
  CUD_730: "cud",
  CONTRATTO_LAVORO: "contratto lavoro",
  ESTRATTO_CONTRIBUTIVO_INPS: "estratto inps",
  ISEE: "isee",
  MODELLO_UNICO: "unico",
  MODELLO_UNICO_1: "unico 1",
  MODELLO_UNICO_2: "unico 2",
  VISURA_CAMERALE: "camera commercio",
  CERTIFICATO_PIVA: "cert piva",
  BILANCINO: "bilancino",
  FATTURE_EMESSE: "fatture",
  NUMERO_TELEFONO_COMMERCIALISTA: "tel commercialista",
  F24: "f24",
  CEDOLINO_PENSIONE: "cedolino pensione",
  MODELLO_OBIS_M: "obis",
  ESTRATTO_CONTO: "ecc",
  LISTA_MOVIMENTI_3_MESI: "lista movimenti",
  CONTRATTO_AFFITTO: "affitto",
  PRELIMINARE_COMPRAVENDITA: "preliminare",
  ATTO_IMMOBILE: "atto provenienza",
  SCHEDE_CATASTALI: "catasto",
  POLIZZE_RISPARMIO: "polizze",
  CONTRATTI_FINANZIAMENTO: "finanziamenti",
  QUIETANZA_RATA_MUTUO: "quietanza mutuo",
  SCONOSCIUTO: "doc",
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
