import type { Document, PreScoringData } from "@/db/schema";
import { MAX_INSTALLMENT_RATIO } from "@/lib/config/documents";

const PAYSLIP_TYPES = new Set([
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
  "CEDOLINO_PENSIONE",
]);

export function computePreScoring(
  docs: Pick<Document, "documentType" | "isValid" | "extractedData">[],
): PreScoringData {
  const notes: string[] = [];
  const payslips = docs.filter(
    (d) => d.isValid && PAYSLIP_TYPES.has(d.documentType) && d.extractedData,
  );

  const netSalaries = payslips
    .map((d) => d.extractedData?.netSalary)
    .filter((n): n is number => typeof n === "number" && !Number.isNaN(n));

  const obligations = payslips
    .map((d) => d.extractedData?.loanDeductions ?? 0)
    .filter((n): n is number => typeof n === "number");

  const cud = docs.find(
    (d) =>
      d.isValid &&
      (d.documentType === "CUD_730" || d.documentType === "MODELLO_UNICO") &&
      typeof d.extractedData?.grossIncomeAnnual === "number",
  );

  const avgNet =
    netSalaries.length > 0
      ? netSalaries.reduce((a, b) => a + b, 0) / netSalaries.length
      : 0;

  const monthlyObligations =
    obligations.length > 0 ? Math.max(...obligations) : 0;

  if (payslips.length > 0) {
    const months = payslips
      .map((d) => d.extractedData?.referenceMonth)
      .filter(Boolean);
    notes.push(
      `Calcolo su ${payslips.length} cedolino/busta paga` +
        (months.length ? ` (${months.join(", ")})` : ""),
    );
  }

  if (monthlyObligations > 0) {
    notes.push(
      `Rilevate trattenute/finanziamenti per circa €${monthlyObligations.toFixed(2)}/mese`,
    );
  }

  const available = Math.max(avgNet - monthlyObligations, 0);
  const estimatedMax =
    Math.round(available * MAX_INSTALLMENT_RATIO * 100) / 100;

  if (netSalaries.length === 0) {
    notes.push(
      "Nessuna busta paga/cedolino valido: netto e rata max non calcolabili",
    );
  } else if (netSalaries.length < 3 && payslips.some((d) => d.documentType.startsWith("BUSTA"))) {
    notes.push(
      `Solo ${netSalaries.length}/3 buste paga con netto leggibile: stima provvisoria`,
    );
  }

  if (!cud) {
    notes.push("CUD/Unico assente o senza reddito lordo: verifica reddito annuo");
  }

  if (avgNet > 0) {
    notes.push(
      `Disponibilità stimata dopo obblighi: €${available.toFixed(2)}/mese, rata max 35% = €${estimatedMax.toFixed(2)}`,
    );
  }

  return {
    net_monthly_income: Math.round(avgNet * 100) / 100,
    estimated_max_installment: estimatedMax,
    monthly_obligations: monthlyObligations,
    cud_gross_annual_income: cud?.extractedData?.grossIncomeAnnual ?? 0,
    notes,
  };
}
