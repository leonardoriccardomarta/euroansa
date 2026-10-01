import { DOCUMENT_TYPE_LABELS } from "@/lib/config/documents";
import type { ChecklistResult } from "@/lib/checklist";

export function buildSollecitoMessage(params: {
  clientName: string;
  brokerName: string;
  checklist: ChecklistResult;
}): string {
  const missingLabels = [
    ...params.checklist.missing.map((t) => DOCUMENT_TYPE_LABELS[t]),
    ...params.checklist.invalid.map(
      (t) => `${DOCUMENT_TYPE_LABELS[t]} (da rifare — non valida)`,
    ),
  ];

  if (params.checklist.isUnset) {
    return `Ciao ${params.clientName.split(" ")[0] || ""},

per procedere con la pratica mutuo ti ricordo di inviarmi i documenti che ti ho indicato.

Puoi inviarmeli pure via WhatsApp o email.
Grazie!
${params.brokerName}`;
  }

  const list =
    missingLabels.length > 0
      ? missingLabels.map((l) => `• ${l}`).join("\n")
      : "• (nessun documento mancante)";

  return `Ciao ${params.clientName.split(" ")[0] || ""},

per procedere con la pratica mutuo ci servono ancora questi documenti:

${list}

Puoi inviarmeli pure via WhatsApp o email.
Grazie!
${params.brokerName}`;
}
