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

/** Es. ALI_ci.pdf, ALI_bp 05.pdf (stile cartella Filippo) */
function buildStandardizedFileName(
  documentType: DocumentType,
  extracted: ExtractedDocumentData,
  originalFileName: string,
): string {
  const ext = originalFileName.includes(".")
    ? originalFileName.slice(originalFileName.lastIndexOf("."))
    : ".pdf";
  const prefix = FILE_NAME_PREFIX[documentType] ?? "doc";
  const surname = sanitizeNamePart(
    extracted.lastName || extracted.firstName,
  ).toUpperCase();
  const monthRaw = extracted.referenceMonth?.trim();
  let monthSuffix = "";
  if (monthRaw) {
    // "05/2026" o "05" → " 05"
    const m = monthRaw.match(/(\d{1,2})/);
    monthSuffix = m ? ` ${m[1]!.padStart(2, "0")}` : ` ${sanitizeNamePart(monthRaw)}`;
  }
  return `${surname}_${prefix}${monthSuffix}${ext}`;
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
- CUD → MODELLO_CUD; 730 → MODELLO_730; Unico → MODELLO_UNICO_1/_2.
- Estratto conto → ESTRATTO_CONTO; lista movimenti → LISTA_MOVIMENTI_3_MESI.
- Atto / preliminare → ATTO_IMMOBILE / PRELIMINARE_COMPRAVENDITA.
- Fogli firmati mediatore (privacy, DDM, mandato) → SCONOSCIUTO.

isValid = true se il file è leggibile e utilizzabile in istruttoria mutua banca.
isValid = false + validationIssues (italiano) se:
1) Illeggibile / tipo incoerente
2) Scaduto rispetto alla DATA DI OGGI (anno letto correttamente!)
3) Titolo precario (es. sola "richiesta asilo" / permesso provvisorio) — segnala, ma documentType resta PERMESSO_SOGGIORNO
4) Estratto incompleto / busta con CIG-cessioni rilevanti (loanDeductions; isValid può restare true se leggibile)
Il broker può comunque accettare a mano: non inventare scadenze false.

Estrai: nome, cognome, CF, expiryDate (GG/MM/AAAA), mese buste, netto, trattenute, lordo annuale.
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
