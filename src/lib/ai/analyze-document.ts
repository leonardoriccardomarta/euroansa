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
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
  "CUD_730",
  "ATTO_IMMOBILE",
  "CEDOLINO_PENSIONE",
  "MODELLO_UNICO",
  "F24",
  "VISURA_CAMERALE",
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
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 40) || "NA";
}

function buildStandardizedFileName(
  documentType: DocumentType,
  extracted: ExtractedDocumentData,
  originalFileName: string,
): string {
  const ext =
    originalFileName.includes(".")
      ? originalFileName.slice(originalFileName.lastIndexOf("."))
      : ".pdf";
  const prefix = FILE_NAME_PREFIX[documentType] ?? "99_Doc";
  const last = sanitizeNamePart(extracted.lastName);
  const first = sanitizeNamePart(extracted.firstName);
  const month = extracted.referenceMonth
    ? `_${sanitizeNamePart(extracted.referenceMonth)}`
    : "";

  if (documentType.startsWith("BUSTA_PAGA") || documentType === "CEDOLINO_PENSIONE") {
    return `${prefix}${month}_${last}${ext}`;
  }
  return `${prefix}_${last}_${first}${ext}`;
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

  const prompt = `Sei un esperto di istruttoria mutui in Italia (Euroansa).
Analizza questo documento (PDF o immagine) e restituisci JSON strutturato.

Regole:
- documentType: identifica il tipo tra quelli ammessi. Per buste paga usa BUSTA_PAGA_1/2/3 in base al mese (più recente = 1) se non chiaro usa BUSTA_PAGA_1.
- isValid: true SOLO se leggibile, non tagliato, non sfuocato; per carta d'identità non scaduta; dati anagrafici presenti quando attesi.
- validationIssues: elenca problemi in italiano (es. "Carta d'identità scaduta il 10/2025", "Busta paga sfuocata").
- Estrai: nome, cognome, codice fiscale, data scadenza (CI), mese riferimento (buste), stipendio netto, trattenute finanziamenti/cessioni, reddito lordo annuale (CUD/Unico).
- Numeri in formato numerico (non stringhe con €).
File originale: ${params.originalFileName}`;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType:
                params.mimeType === "application/octet-stream" &&
                params.originalFileName.toLowerCase().endsWith(".pdf")
                  ? "application/pdf"
                  : params.mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Risposta Gemini vuota");
  }

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
}
