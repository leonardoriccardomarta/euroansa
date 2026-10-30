import { GoogleGenAI, Type } from "@google/genai";
import type { DocumentType, ExtractedDocumentData } from "@/db/schema";
import { FILE_NAME_PREFIX } from "@/lib/config/documents";
import {
  isExpiryBeforeToday,
  sanitizeAiValidationIssues,
} from "@/lib/ai/date-sanity";

export type AnalyzeDocumentResult = {
  documentType: DocumentType;
  isValid: boolean;
  extractedData: ExtractedDocumentData;
  validationIssues: string[];
  standardizedFileName: string;
};

const DOCUMENT_TYPES: DocumentType[] = [
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
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
  "MODELLO_CUD",
  "MODELLO_730",
  "CUD_730",
  "CONTRATTO_LAVORO",
  "ESTRATTO_CONTRIBUTIVO_INPS",
  "ISEE",
  "MODELLO_UNICO",
  "MODELLO_UNICO_1",
  "MODELLO_UNICO_2",
  "VISURA_CAMERALE",
  "CERTIFICATO_PIVA",
  "BILANCINO",
  "FATTURE_EMESSE",
  "NUMERO_TELEFONO_COMMERCIALISTA",
  "F24",
  "CEDOLINO_PENSIONE",
  "MODELLO_OBIS_M",
  "ESTRATTO_CONTO",
  "LISTA_MOVIMENTI_3_MESI",
  "CONTRATTO_AFFITTO",
  "PRELIMINARE_COMPRAVENDITA",
  "ATTO_IMMOBILE",
  "SCHEDE_CATASTALI",
  "POLIZZE_RISPARMIO",
  "CONTRATTI_FINANZIAMENTO",
  "QUIETANZA_RATA_MUTUO",
  "APE",
  "SCONOSCIUTO",
];

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      enum: DOCUMENT_TYPES,
    },
    isValid: { type: Type.BOOLEAN },
    extractedData: {
      type: Type.OBJECT,
      properties: {
        firstName: { type: Type.STRING, nullable: true },
        lastName: { type: Type.STRING, nullable: true },
        fiscalCode: { type: Type.STRING, nullable: true },
        expiryDate: { type: Type.STRING, nullable: true },
        referenceMonth: { type: Type.STRING, nullable: true },
        netSalary: { type: Type.NUMBER, nullable: true },
        loanDeductions: { type: Type.NUMBER, nullable: true },
        grossIncomeAnnual: { type: Type.NUMBER, nullable: true },
        bankName: { type: Type.STRING, nullable: true },
        propertyDetail: { type: Type.STRING, nullable: true },
        euroansaDocType: { type: Type.STRING, nullable: true },
        bancaDocType: { type: Type.STRING, nullable: true },
        alsoCovers: {
          type: Type.ARRAY,
          nullable: true,
          items: { type: Type.STRING, enum: DOCUMENT_TYPES },
        },
      },
    },
    validationIssues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["documentType", "isValid", "extractedData", "validationIssues"],
};

function sanitizeNamePart(value: string | null | undefined): string {
  if (!value) return "NA";
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 40) || "NA"
  );
}

/** Standard naming per i documenti della pratica */
export function buildStandardizedFileName(
  documentType: DocumentType,
  extracted: ExtractedDocumentData,
  originalFileName: string,
): string {
  const ext = originalFileName.includes(".")
    ? originalFileName.slice(originalFileName.lastIndexOf("."))
    : ".pdf";
  const safeExt = ext.toLowerCase() === ".pdf" ? ".pdf" : ext;
  const surname = sanitizeNamePart(
    extracted.lastName || extracted.firstName,
  ).toUpperCase();
  const origLower = originalFileName.toLowerCase();

  // 1. EUROANSA Folder (Signed Compliance Forms - OUTSIDE Requirements Checklist)
  if (extracted.euroansaDocType) {
    return `${surname}_Euroansa_${extracted.euroansaDocType}${safeExt}`;
  }
  if (/youdomus|antiriciclaggio.*lar|lar.*antiriciclaggio|adeguata.*verifica.*youdomus/i.test(origLower)) {
    return `${surname}_Euroansa_Youdomus_Adeguata_Verifica${safeExt}`;
  }
  if (/relazione.*mutuo|dati.*pratica.*mutuo|relazione.*tipo/i.test(origLower)) {
    return `${surname}_Euroansa_Relazione_Mutuo${safeExt}`;
  }
  if (/priv.*rev|allegato.*1.*privacy|informativa.*privacy/i.test(origLower)) {
    return `${surname}_Euroansa_Allegato_1_Privacy${safeExt}`;
  }
  if (/cmcc.*rev|contratto.*mediazione|consulenza.*mediazione/i.test(origLower)) {
    return `${surname}_Euroansa_Contratto_Mediazione_CMCC${safeExt}`;
  }
  if (/avc.*r|adeguata.*verifica.*clientela|art\.?\s*22.*231/i.test(origLower)) {
    return `${surname}_Euroansa_Adeguata_Verifica_AVC${safeExt}`;
  }
  if (/afi-tr|trasparenza.*banca.*d'?italia|attestazione.*trasparenza/i.test(origLower)) {
    return `${surname}_Euroansa_Attestazione_Trasparenza_AFI-TR${safeExt}`;
  }
  if (/valutazione.*rischio.*riciclaggio|scheda.*rischio.*antiriciclaggio/i.test(origLower)) {
    return `${surname}_Euroansa_Scheda_Rischio_Antiriciclaggio${safeExt}`;
  }

  // 2. BANCA Folder (Signed Bank Forms - OUTSIDE Checklist)
  if (extracted.bancaDocType) {
    const bank = sanitizeNamePart(extracted.bankName || "BANCA").toUpperCase();
    return `${surname}_${bank}_${extracted.bancaDocType}${safeExt}`;
  }
  if (/ddm|delega.*di.*pagamento/i.test(origLower) && (origLower.includes("banca") || extracted.bankName)) {
    const bank = sanitizeNamePart(extracted.bankName || "BANCA").toUpperCase();
    return `${surname}_${bank}_DDM${safeExt}`;
  }
  if (/pies/i.test(origLower)) {
    const bank = sanitizeNamePart(extracted.bankName || "BANCA").toUpperCase();
    return `${surname}_${bank}_PIES${safeExt}`;
  }
  if (/richiesta.*mutuo.*firmata|modulo.*richiesta.*mutuo/i.test(origLower)) {
    const bank = sanitizeNamePart(extracted.bankName || "BANCA").toUpperCase();
    return `${surname}_${bank}_Richiesta_Mutuo_Firmata${safeExt}`;
  }

  // 3. IMMOBILE Folder
  if (documentType === "APE" || /attestato.*prestazione.*energetica|\bape\b/i.test(origLower)) {
    return `${surname}_APE${safeExt}`;
  }
  if (documentType === "SCHEDE_CATASTALI") {
    const detail = extracted.propertyDetail
      ? `_${sanitizeNamePart(extracted.propertyDetail).toUpperCase()}`
      : "";
    if (/planimetr/i.test(origLower)) {
      return `${surname}_Planimetria${detail}${safeExt}`;
    }
    return `${surname}_Visura_Catastale${detail}${safeExt}`;
  }
  if (documentType === "ATTO_IMMOBILE") {
    return `${surname}_Atto_Provenienza${safeExt}`;
  }
  if (documentType === "PRELIMINARE_COMPRAVENDITA") {
    return `${surname}_Preliminare_Compravendita${safeExt}`;
  }

  // 4. CLIENT Folder: Base & Anagrafica
  if (documentType === "CARTA_IDENTITA") return `${surname}_CartaIdentita${safeExt}`;
  if (documentType === "TESSERA_SANITARIA") return `${surname}_TesseraSanitaria${safeExt}`;
  if (documentType === "PASSAPORTO") return `${surname}_Passaporto${safeExt}`;
  if (documentType === "PERMESSO_SOGGIORNO") return `${surname}_PermessoSoggiorno${safeExt}`;
  if (documentType === "ATTO_MATRIMONIO") return `${surname}_Certificato_Matrimonio${safeExt}`;
  if (documentType === "CERTIFICATO_RESIDENZA") return `${surname}_Certificato_Residenza${safeExt}`;
  if (documentType === "STATO_FAMIGLIA") return `${surname}_Stato_Famiglia${safeExt}`;
  if (documentType === "CERTIFICATO_STATO_LIBERO") return `${surname}_Certificato_Stato_Libero${safeExt}`;
  if (documentType === "CERTIFICATO_VEDOVANZA") return `${surname}_Certificato_Vedovanza${safeExt}`;
  if (documentType === "OMOLOGA_SEPARAZIONE") return `${surname}_Omologa_Separazione${safeExt}`;
  if (documentType === "SENTENZA_DIVORZIO") return `${surname}_Sentenza_Divorzio${safeExt}`;

  // Busta Paga: [COGNOME]_BustaPaga_[Mese/Anno].pdf
  if (
    documentType === "BUSTA_PAGA_1" ||
    documentType === "BUSTA_PAGA_2" ||
    documentType === "BUSTA_PAGA_3"
  ) {
    const monthRaw = extracted.referenceMonth?.trim();
    let monthSuffix = "";
    if (monthRaw) {
      const cleanMonth = sanitizeNamePart(monthRaw.replace(/[\/\s-]+/g, "_"));
      monthSuffix = cleanMonth && cleanMonth !== "NA" ? `_${cleanMonth}` : "";
    }
    return `${surname}_BustaPaga${monthSuffix}${safeExt}`;
  }

  // Certificazione Unica: [COGNOME]_Modello_CU.pdf
  if (documentType === "MODELLO_CUD" || documentType === "CUD_730") {
    return `${surname}_Modello_CU${safeExt}`;
  }
  if (documentType === "MODELLO_730") return `${surname}_Modello_730${safeExt}`;
  if (documentType === "MODELLO_UNICO" || documentType === "MODELLO_UNICO_1") {
    return `${surname}_Modello_Unico_1${safeExt}`;
  }
  if (documentType === "MODELLO_UNICO_2") {
    return `${surname}_Modello_Unico_2${safeExt}`;
  }

  // ESTRATTO CONTO (Bank Statement) Multi-file Rule:
  // Prefix strictly EC, extract bank and period: [COGNOME]_EC_[Banca]_[Periodo/Mese].pdf
  if (documentType === "ESTRATTO_CONTO" || documentType === "LISTA_MOVIMENTI_3_MESI") {
    const bank = extracted.bankName && extracted.bankName !== "NA"
      ? sanitizeNamePart(extracted.bankName)
      : "";
    const monthRaw = extracted.referenceMonth?.trim();
    const period = monthRaw ? sanitizeNamePart(monthRaw.replace(/[\/\s-]+/g, "_")) : "";
    const cleanPeriod = period && period !== "NA" ? period : "";

    if (bank && cleanPeriod) {
      return `${surname}_EC_${bank}_${cleanPeriod}${safeExt}`;
    } else if (bank) {
      return `${surname}_EC_${bank}${safeExt}`;
    } else if (cleanPeriod) {
      return `${surname}_EC_${cleanPeriod}${safeExt}`;
    }
    return `${surname}_EC${safeExt}`;
  }

  // Altri tipi standard
  if (documentType === "CONTRATTO_LAVORO") return `${surname}_Contratto_Lavoro${safeExt}`;
  if (documentType === "ESTRATTO_CONTRIBUTIVO_INPS") return `${surname}_Estratto_INPS${safeExt}`;
  if (documentType === "ISEE") return `${surname}_ISEE${safeExt}`;
  if (documentType === "VISURA_CAMERALE") return `${surname}_Visura_Camerale${safeExt}`;
  if (documentType === "CERTIFICATO_PIVA") return `${surname}_Certificato_PIVA${safeExt}`;
  if (documentType === "BILANCINO") return `${surname}_Bilancino${safeExt}`;
  if (documentType === "FATTURE_EMESSE") return `${surname}_Fatture_Emesse${safeExt}`;
  if (documentType === "F24") return `${surname}_F24${safeExt}`;
  if (documentType === "CEDOLINO_PENSIONE") return `${surname}_Cedolino_Pensione${safeExt}`;
  if (documentType === "MODELLO_OBIS_M") return `${surname}_Modello_OBIS${safeExt}`;
  if (documentType === "CONTRATTO_AFFITTO") return `${surname}_Contratto_Affitto${safeExt}`;
  if (documentType === "POLIZZE_RISPARMIO") return `${surname}_Polizze${safeExt}`;
  if (documentType === "CONTRATTI_FINANZIAMENTO") return `${surname}_Contratti_Finanziamento${safeExt}`;
  if (documentType === "QUIETANZA_RATA_MUTUO") return `${surname}_Quietanza_Rata_Mutuo${safeExt}`;
  if (documentType === "NUMERO_TELEFONO_COMMERCIALISTA") return `${surname}_Telefono_Commercialista${safeExt}`;

  const prefix = FILE_NAME_PREFIX[documentType] ?? "Doc";
  return `${surname}_${sanitizeNamePart(prefix)}${safeExt}`;
}

function resolveModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  // Solo modelli Gemini 3 stable (2.0 è shut down; 2.5 limitato ai legacy users)
  const fallbacks = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ];
  const list = preferred ? [preferred, ...fallbacks] : fallbacks;
  return [...new Set(list)];
}

function isDailyQuotaError(msg: string): boolean {
  return (
    msg.includes("PerDay") ||
    msg.includes("RequestsPerDay") ||
    (msg.includes("quotaValue\":\"20\"") && msg.includes("PerDay"))
  );
}

function isRetryableTransient(msg: string): boolean {
  return (
    msg.includes('"code":503') ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    (msg.includes('"code":429') && !isDailyQuotaError(msg))
  );
}

export async function analyzeDocument(params: {
  buffer: Buffer;
  mimeType: string;
  originalFileName: string;
}): Promise<AnalyzeDocumentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY non configurata");
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64 = params.buffer.toString("base64");

  const todayRome = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const prompt = `Sei un esperto di istruttoria mutui in Italia (mediatore creditizio).
Analizza il CONTENUTO reale di questo PDF/immagine (non fidarti solo del nome file).

DATA DI OGGI (Europe/Rome): ${todayRome} (ISO ${todayIso}).
Usa SOLO questa data per scadenze / "futuro". Esempio: ottobre 2026 → giugno 2026 è PASSATO. Non inventare un'altra data odierna.

DATE ITALIANE (obbligatorio):
- Formato documenti IT: GG/MM/AAAA (giorno/mese/anno). Esempio: 06/10/2026 = 6 ottobre 2026, NON giugno 2010 né 2024.
- Leggi TUTTE e QUATTRO le cifre dell'anno. Se vedi "2026" non scrivere mai 2024/2025 per errore OCR.
- expiryDate in extractedData: stringa GG/MM/AAAA come sul documento, senza reinterpretazioni.
- Un titolo/permesso è scaduto SOLO se expiryDate < DATA DI OGGI. Se scadenza ≥ oggi → non dire "scaduto".

documentType = tipo PRINCIPALE checklist (uno solo). alsoCovers = altri tipi nello STESSO file.

Classificazione (contenuto reale, stile checklist Filippo / mediatore):
- ANPR / stato di famiglia / certificato contestuale / residenza → STATO_FAMIGLIA (+ CERTIFICATO_RESIDENZA in alsoCovers se c'è). Mai busta paga. "Cumulativo" ≠ busta.
- 3 buste stesso PDF → BUSTA_PAGA_1 + alsoCovers BUSTA_PAGA_2/3.
- CI + tessera sanitaria → CARTA_IDENTITA + alsoCovers TESSERA_SANITARIA.
- CI + permesso → CARTA_IDENTITA + alsoCovers PERMESSO_SOGGIORNO.
- Solo permesso di soggiorno / titolo di soggiorno (anche foto WhatsApp) → PERMESSO_SOGGIORNO (mai SCONOSCIUTO se leggibile).
- CUD / CU → MODELLO_CUD; 730 → MODELLO_730; Unico → MODELLO_UNICO_1/_2.
- Estratto conto → ESTRATTO_CONTO; lista movimenti → LISTA_MOVIMENTI_3_MESI. Estrai bankName (es. Unicredit, Intesa, BPER, Poste, CreditAgricole, BPM) e referenceMonth (es. Maggio, 05).
- APE (Attestato Prestazione Energetica) → APE.
- Schede catastali / visura / planimetria → SCHEDE_CATASTALI. Estrai in propertyDetail eventuale subalterno o destinazione (es. SUB 1, SUB 2, BOX, APPARTAMENTO).
- Atto immobile / rogito acquisto → ATTO_IMMOBILE; preliminare compravendita / proposta → PRELIMINARE_COMPRAVENDITA.
- Moduli interni Euroansa (fuori checklist cliente, imposta documentType = SCONOSCIUTO):
  * "Youdomus" / "Adeguata Verifica" / "LAR" → euroansaDocType = "Youdomus_Adeguata_Verifica"
  * "DATI PRATICA MUTUO" / "RELAZIONE TIPO" → euroansaDocType = "Relazione_Mutuo"
  * "Informativa Privacy" / "PRIV REV" → euroansaDocType = "Allegato_1_Privacy"
  * "CONTRATTO DI CONSULENZA E MEDIAZIONE" / "CMCC Rev" → euroansaDocType = "Contratto_Mediazione_CMCC"
  * "ADEGUATA VERIFICA CLIENTELA" / "AVC R" / "ART. 22" → euroansaDocType = "Adeguata_Verifica_AVC"
  * "ATTESTAZIONE TRASPARENZA" / "AFI-TR" → euroansaDocType = "Attestazione_Trasparenza_AFI-TR"
  * "VALUTAZIONE RISCHIO RICICLAGGIO" → euroansaDocType = "Scheda_Rischio_Antiriciclaggio"
- Moduli firmati banca (fuori checklist, documentType = SCONOSCIUTO):
  * DDM / delega pagamento → bancaDocType = "DDM" con bankName (es. BDM, ING, Valsabbina, CA)
  * PIES → bancaDocType = "PIES" con bankName
  * Richiesta mutuo firmata → bancaDocType = "Richiesta_Mutuo_Firmata" con bankName

isValid = true se il file è leggibile e utilizzabile in istruttoria mutua banca (anche moduli Euroansa e Banca compilati e firmati sono validi).
isValid = false + validationIssues (italiano) se:
1) Illeggibile / tipo incoerente
2) Scaduto rispetto alla DATA DI OGGI (anno letto correttamente!)
3) Titolo precario (es. sola "richiesta asilo" / permesso provvisorio) — segnala, ma documentType resta PERMESSO_SOGGIORNO
4) Estratto incompleto / busta con CIG-cessioni rilevanti (loanDeductions; isValid può restare true se leggibile)
Il broker può comunque accettare a mano: non inventare scadenze false.

Estrai: nome, cognome, CF, expiryDate (GG/MM/AAAA), referenceMonth, bankName, propertyDetail, euroansaDocType, bancaDocType, netto, trattenute, lordo annuale.
Numeri numerici. File originale (solo hint): ${params.originalFileName}`;

  const mimeType =
    params.mimeType === "application/octet-stream" &&
    params.originalFileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : params.mimeType;

  const models = resolveModels();
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        const text = response.text;
        if (!text) throw new Error("Risposta Gemini vuota");

        const parsed = JSON.parse(text) as {
          documentType: DocumentType;
          isValid: boolean;
          extractedData: ExtractedDocumentData;
          validationIssues: string[];
        };

        const documentType = DOCUMENT_TYPES.includes(parsed.documentType)
          ? parsed.documentType
          : "SCONOSCIUTO";

        const rawAlso = parsed.extractedData?.alsoCovers ?? [];
        const alsoCovers = [
          ...new Set(
            (Array.isArray(rawAlso) ? rawAlso : [])
              .filter(
                (t): t is DocumentType =>
                  typeof t === "string" &&
                  DOCUMENT_TYPES.includes(t as DocumentType) &&
                  t !== "SCONOSCIUTO" &&
                  t !== documentType,
              )
              .map((t) => t as DocumentType),
          ),
        ];

        const extractedData: ExtractedDocumentData = {
          ...(parsed.extractedData ?? {}),
          alsoCovers: alsoCovers.length ? alsoCovers : null,
        };

        let validationIssues = sanitizeAiValidationIssues(
          parsed.validationIssues ?? [],
        );

        // Scadenza: solo se expiryDate è davvero prima di oggi (Roma)
        const expiry = extractedData.expiryDate?.trim() ?? null;
        if (expiry && !isExpiryBeforeToday(expiry)) {
          validationIssues = validationIssues.filter(
            (i) => !/scadut/i.test(i),
          );
        }

        let isValid =
          Boolean(parsed.isValid) && documentType !== "SCONOSCIUTO";
        // Se restano solo avvisi spurî già filtrati e il tipo è noto → valido
        if (
          documentType !== "SCONOSCIUTO" &&
          validationIssues.length === 0 &&
          parsed.isValid === false &&
          (parsed.validationIssues?.length ?? 0) > 0
        ) {
          // Tutti gli issue erano date inventate → ripristina validità se leggibile
          isValid = true;
        }
        if (expiry && isExpiryBeforeToday(expiry)) {
          isValid = false;
          if (!validationIssues.some((i) => /scadut/i.test(i))) {
            validationIssues = [
              ...validationIssues,
              `Documento scaduto in data ${expiry}`,
            ];
          }
        }

        return {
          documentType,
          isValid,
          extractedData,
          validationIssues,
          standardizedFileName: buildStandardizedFileName(
            documentType,
            extractedData,
            params.originalFileName,
          ),
        };
      } catch (error) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);

        // Quota giornaliera su questo modello → passa al successivo
        if (isDailyQuotaError(msg) || msg.includes("no longer available")) {
          break;
        }

        if (!isRetryableTransient(msg) || attempt === 1) break;

        const delayMatch = msg.match(/retry in ([\d.]+)s/i);
        const delayMs = delayMatch
          ? Math.min(Math.ceil(Number(delayMatch[1]) * 1000) + 500, 12000)
          : 4000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError));
}
