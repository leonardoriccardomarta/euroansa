import { GoogleGenAI, Type } from "@google/genai";
import type { DocumentType } from "@/db/schema";

const ALLOWED: DocumentType[] = [
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

type Item = { id: string; fileName: string };

/**
 * Classifica tipi documento solo dai nomi file (batch Gemini).
 * Per residuali dopo euristica, cartelle DOC/IMMOBILE.
 */
export async function classifyFilenamesWithAi(
  items: Item[],
): Promise<Map<string, DocumentType>> {
  const out = new Map<string, DocumentType>();
  if (!items.length) return out;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return out;

  const ai = new GoogleGenAI({ apiKey });
  const models = [
    process.env.GEMINI_MODEL?.trim(),
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ].filter(Boolean) as string[];

  const schema = {
    type: Type.OBJECT,
    properties: {
      results: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            documentType: { type: Type.STRING, enum: ALLOWED },
          },
          required: ["id", "documentType"],
        },
      },
    },
    required: ["results"],
  };

  // Chunk per non sforare contesto
  const chunkSize = 40;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const list = chunk
      .map((it) => `- id=${it.id} | file=${it.fileName}`)
      .join("\n");

    const prompt = `Sei un mediatore creditizio italiano. Classifica ogni file per tipo documento istruttoria mutuo.

Regole nomi tipici Drive:
- bp / busta paga → BUSTA_PAGA_1/2/3 (numero mese: 03→3)
- cud / cu → MODELLO_CUD o CUD_730
- ecc (non inps) → ESTRATTO_CONTO; ecc inps / contributivo → ESTRATTO_CONTRIBUTIVO_INPS
- unilav / contratto lavoro → CONTRATTO_LAVORO
- ci / carta identità → CARTA_IDENTITA
- ts → TESSERA_SANITARIA; pds → PERMESSO_SOGGIORNO
- lista movimenti → LISTA_MOVIMENTI_3_MESI
- atto / provenienza → ATTO_IMMOBILE
- preliminare / proposta → PRELIMINARE_COMPRAVENDITA
- planimetrie / catastale → SCHEDE_CATASTALI
- residenza → CERTIFICATO_RESIDENZA
- visura → VISURA_CAMERALE
- APE, DDM, privacy, avvenuta consegna, firmati → SCONOSCIUTO

Solo tipi della lista enum. File:
${list}`;

    type AiOut = { results: { id: string; documentType: string }[] };
    let parsed: AiOut | null = null;
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        });
        const text = response.text;
        if (!text) continue;
        parsed = JSON.parse(text) as AiOut;
        break;
      } catch {
        // next model
      }
    }
    if (!parsed?.results?.length) continue;
    for (const r of parsed.results) {
      const t = r.documentType as DocumentType;
      if (ALLOWED.includes(t) && chunk.some((c) => c.id === r.id)) {
        out.set(r.id, t);
      }
    }
  }

  return out;
}
