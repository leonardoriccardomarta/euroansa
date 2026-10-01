import { GoogleGenAI, Type } from "@google/genai";
import type { DocumentType, ExtractedDocumentData } from "@/db/schema";
import { FILE_NAME_PREFIX } from "@/lib/config/documents";

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

function buildStandardizedFileName(
  documentType: DocumentType,
  extracted: ExtractedDocumentData,
  originalFileName: string,
): string {
  const ext = originalFileName.includes(".")
    ? originalFileName.slice(originalFileName.lastIndexOf("."))
    : ".pdf";
  const prefix = FILE_NAME_PREFIX[documentType] ?? "99_Doc";
  const last = sanitizeNamePart(extracted.lastName);
  const first = sanitizeNamePart(extracted.firstName);
  const month = extracted.referenceMonth
    ? `_${sanitizeNamePart(extracted.referenceMonth)}`
    : "";
  return `${prefix}_${last}_${first}${month}${ext}`;
}

function resolveModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const fallbacks = [
    "gemini-3.8-flash",
    "gemini-2.0-flash",
    "gemini-flash-lite-latest",
    "gemini-2.0-flash-lite",
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

  const prompt = `Sei un esperto di istruttoria mutui in Italia (Euroansa / mediatore creditizio).
Analizza questo documento (PDF o immagine) e restituisci JSON strutturato.

documentType: identifica il tipo tra quelli ammessi (lista Filippo).
- Buste paga: BUSTA_PAGA_1/2/3 (più recente = 1); se non chiaro BUSTA_PAGA_1.
- CUD → MODELLO_CUD; 730 → MODELLO_730 (non usare CUD_730 se puoi distinguere).
- Modello Unico: MODELLO_UNICO_1 (più recente) o MODELLO_UNICO_2; se un solo file senza anno → MODELLO_UNICO_1.
- Estratto conto ufficiale → ESTRATTO_CONTO; lista movimenti 3 mesi → LISTA_MOVIMENTI_3_MESI.
- OBIS M pensionati → MODELLO_OBIS_M.
- Atto provenienza immobile → ATTO_IMMOBILE; preliminare/proposta → PRELIMINARE_COMPRAVENDITA.

isValid = true SOLO se il documento è utilizzabile in istruttoria. Imposta false e popola validationIssues se:
1) Foto/scansione non leggibile, sfuocata, tagliata, troppo scura o con riflessi
2) Documento scaduto (es. carta d'identità / permesso oltre data scadenza)
3) Documento errato rispetto a quello atteso / tipo non coerente col contenuto
4) Lista movimenti / estratto conto: senza saldo, date sbagliate o incoerenti, periodo incompleto
5) Estratto conto con movimenti sospetti: grossi prelievi, grossi versamenti, bonifici ad amici/terzi non giustificati
6) Busta paga con trattenute critiche da segnalare: cassa integrazione (CIG), cessione del quinto, pignoramenti, altre trattenute finanziamenti rilevanti (indica anche l'importo in loanDeductions se possibile)
7) Dati anagrafici assenti quando attesi (nome/cognome/CF)

Nota: trattenute/cessione del quinto → documento può restare "valido" per tipo ma DEVI elencare il problema in validationIssues e valorizzare loanDeductions. isValid=false se il documento è illeggibile o chiaramente inutilizzabile.

Estrai: nome, cognome, codice fiscale, data scadenza (CI), mese riferimento (buste), stipendio netto, trattenute finanziamenti/cessioni/CIG, reddito lordo annuale (CUD/Unico).
Numeri in formato numerico (non stringhe con €). validationIssues in italiano, frasi chiare per il broker.
File originale: ${params.originalFileName}`;

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

        return {
          documentType,
          isValid: Boolean(parsed.isValid) && documentType !== "SCONOSCIUTO",
          extractedData: parsed.extractedData ?? {},
          validationIssues: parsed.validationIssues ?? [],
          standardizedFileName: buildStandardizedFileName(
            documentType,
            parsed.extractedData ?? {},
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
