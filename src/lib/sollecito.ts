import {
  DOCUMENT_TYPE_LABELS,
  sheetRowsForRequired,
} from "@/lib/config/documents";
import type { ChecklistResult } from "@/lib/checklist";

export function buildSollecitoMessage(params: {
  clientName: string;
  brokerName: string;
  checklist: ChecklistResult;
}): string {
  if (params.checklist.isUnset) {
    return `Ciao ${params.clientName.split(" ")[0] || ""},

per procedere con la pratica mutuo ti ricordo di inviarmi i documenti che ti ho indicato.

Puoi inviarmeli pure via WhatsApp o email.
Grazie!
${params.brokerName}`;
  }

  const rows = sheetRowsForRequired(params.checklist.required);
  const missingLabels = rows
    .filter((row) => {
      const allOk = row.types.every((t) =>
        params.checklist.presentValid.includes(t),
      );
      return !allOk;
    })
    .map((row) => {
      const invalid = row.types.some((t) =>
        params.checklist.invalid.includes(t),
      );
      return invalid ? `${row.label} (da rifare)` : row.label;
    });

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
