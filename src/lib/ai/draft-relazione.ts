import { GoogleGenAI, Type } from "@google/genai";
import type {
  Application,
  Document,
  ExtractedDocumentData,
  PreScoringData,
} from "@/db/schema";

function resolveModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const fallbacks = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ];
  const list = preferred ? [preferred, ...fallbacks] : fallbacks;
  return [...new Set(list)];
}

function summarizeDocs(docs: Document[]): string {
  return docs
    .slice(0, 40)
    .map((d) => {
      const ex = (d.extractedData ?? {}) as ExtractedDocumentData;
      const bits = [
        d.documentType,
        d.isValid ? "ok" : "invalid",
        ex.firstName || ex.lastName
          ? `${ex.firstName ?? ""} ${ex.lastName ?? ""}`.trim()
          : null,
        ex.fiscalCode ? `CF ${ex.fiscalCode}` : null,
        ex.netSalary != null ? `netto ${ex.netSalary}` : null,
        ex.loanDeductions != null ? `trattenute ${ex.loanDeductions}` : null,
        ex.referenceMonth ? `mese ${ex.referenceMonth}` : null,
        (d.validationIssues ?? []).length
          ? `issues: ${d.validationIssues.join("; ")}`
          : null,
      ].filter(Boolean);
      return `- ${bits.join(" | ")}`;
    })
    .join("\n");
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    body: { type: Type.STRING },
  },
  required: ["body"],
};

export async function draftRelazioneText(params: {
  app: Application;
  docs: Document[];
  scoring: PreScoringData | null;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY non configurata");

  const ai = new GoogleGenAI({ apiKey });
  const a = params.app;

  const prompt = `Sei un consulente del credito italiano. Scrivi la bozza di RELAZIONE TIPO per la pratica mutuo, in italiano formale e chiaro, stile Euroansa/Kiron.

Struttura obbligatoria (testo plain, senza markdown):

DATI PRATICA MUTUO:

INTESTATARI IMMOBILE:
...
INTESTATARI MUTUO:
...
TELEFONO e MAIL:
...
GARANTI:
NO (o dettagli se noti)
MUTUO RICHIESTO:
...
VALORE IMMOBILE:
...
% INTERVENTO LTV:
...
FINALITA':
...
DURATA:
...
BANCA:
...
PRODOTTO:
...
DATA PREVISTA ATTO:
...

RELAZIONE TIPO:

* bullet punti biografici/reddituali (stato civile, figli, affitto, datore, stipendio, assegni unici, prestiti, note rilevanti dai documenti)

Usa SOLO i dati forniti. Se manca un dato metti "—" o ometti il dettaglio senza inventare. Numeri in formato italiano (€ e punti migliaia).

DATI PRATICA:
- Cliente: ${a.clientName}
- Email: ${a.clientEmail}
- Telefono: ${a.phone ?? "—"}
- CF: ${a.clientFiscalCode ?? "—"}
- Tipo impiego: ${a.employmentType}
- Banca: ${a.bankName ?? "—"}
- Operazione: ${a.operationType ?? "—"}
- Mutuo: ${a.loanAmount ?? "—"}
- Immobile: ${a.propertyAmount ?? "—"}
- LTV %: ${a.ltvPercent ?? "—"}
- Provenienza: ${a.provenance ?? "—"}
- Note economia: ${a.economicNotes ?? "—"}

PRE-SCORING:
${JSON.stringify(params.scoring ?? {}, null, 2)}

DOCUMENTI ANALIZZATI:
${summarizeDocs(params.docs) || "(nessun documento)"}

Rispondi JSON con campo "body" = testo completo della relazione.`;

  let lastError: unknown;
  for (const model of resolveModels()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });
      const text = response.text;
      if (!text) throw new Error("Risposta Gemini vuota");
      const parsed = JSON.parse(text) as { body?: string };
      const body = parsed.body?.trim();
      if (!body) throw new Error("Bozza relazione vuota");
      return body;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no longer available") || msg.includes("PerDay")) continue;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError));
}
