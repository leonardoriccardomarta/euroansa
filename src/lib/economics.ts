/** Economia pratica — formule foglio Filip PRATICHE CONCLUSE / BUDGET */

export const DEFAULT_COLLABORATOR_SHARE = 0.35;

/** Provenienze tipiche (foglio DATI) — editabili in Impostazioni */
export const DEFAULT_PROVENANCE_OPTIONS = [
  "DIRETTA",
  "INTERNET",
  "TECNOCASA VERDELLO",
  "TECNOCASA BOLTIERE",
  "TECNOCASA FARA GERA D’ADDA",
  "TECNOCASA SAN ROCCO",
  "TECNOCASA MONZA CENTRO",
  "TECNOCASA TRIANTE",
  "TECNOCASA OSNAGO",
  "TECNOCASA BERNAREGGIO",
  "TECNOCASA TREZZO",
  "TECNOCASA LISSONE",
  "TECNOCASA SEREGNO MATTEOTTI",
  "TECNOCASA SEREGNO STAZIONE",
  "TECNOCASA VIMERCATE",
  "TECNORETE GESSATE",
  "TECNORETE PESSANO",
  "FUMAGALLI IMMOBILI",
  "TECNOCASA RIVOLTA",
  "TECNOCASA VAILATE",
  "TECNOCASA TREVIGLIO NORD",
  "TECNOCASA TREVIGLIO SUD",
  "TECNOCASA CARAVAGGIO",
  "TECNOCASA CASSANO",
  "FEELING HOME",
  "PROFESSIONE CASA GESSATE",
  "PROFESSIONE CASA INZAGO",
  "PROFESSIONE CASA VAPRIO",
  "IP IMMOBILIARE",
  "SAMUELE CURTI",
] as const;

export type CommissionInputs = {
  commissionClient?: number | null;
  commissionBank?: number | null;
  commissionPolicy?: number | null;
  commissionCqs?: number | null;
  commissionLoans?: number | null;
  commissionNotary?: number | null;
};

function n(v: number | null | undefined): number {
  if (v == null || Number.isNaN(v)) return 0;
  return v;
}

/**
 * Fatturato pratica (formula Filip):
 * (POLIZZA / 2) + CQS + BANCA + CLIENTE + PRESTITI
 * Notaio escluso dal totale (campo a parte).
 */
export function practiceRevenue(c: CommissionInputs): number {
  return (
    n(c.commissionPolicy) / 2 +
    n(c.commissionCqs) +
    n(c.commissionBank) +
    n(c.commissionClient) +
    n(c.commissionLoans)
  );
}

export function collaboratorPayout(
  revenue: number,
  sharePercent = DEFAULT_COLLABORATOR_SHARE,
): number {
  return revenue * sharePercent;
}

/** % ricavo su mutuo erogato */
export function revenueOnLoanPercent(
  revenue: number,
  loanAmount: number | null | undefined,
): number | null {
  const loan = n(loanAmount);
  if (loan <= 0) return null;
  return (revenue / loan) * 100;
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabelIt(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

export const AUDIT_FIELDS = [
  { key: "auditPrivacy", label: "Privacy" },
  { key: "auditContractSigned", label: "Firma contratto" },
  { key: "auditInstituteSheet", label: "Foglio istituto" },
  { key: "auditDdmBank", label: "DDM banca" },
  { key: "auditOriginalsVerified", label: "Verifica originali" },
  { key: "auditArchive", label: "Archivio" },
] as const;
