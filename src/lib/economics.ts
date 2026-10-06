/** Economia pratica   formule foglio Filip PRATICHE CONCLUSE / BUDGET */

export const DEFAULT_COLLABORATOR_SHARE = 0.35;

/** Provenienze tipiche (foglio DATI)   editabili in Impostazioni */
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
  "GABETTI MONZA",
  "STUDIO VI",
  "RG REAL ESTATE",
  "EUROSERVICE",
  "PR IMMOBILIARE",
  "SPAGNOLI",
  "VIVERE CASA",
  "LURECO",
  "SOGNOCASA",
  "BB CARUGATE",
  "FABIO IMMOBILIARE TREVIGLIO",
  "TEMPOCASA CARAVAGGIO",
  "LOMBARDIA IMMOBILI",
  "ITALCASA",
  "HOMS",
  "RAFFAELLA CORTESI",
  "MATTIA RAVASI",
] as const;

/** Tipi operazione (anche solo CQS / prestito senza mutuo) */
export const OPERATION_TYPES = [
  "MUTUO",
  "SURROGA",
  "MUTUO+CQS",
  "CQS",
  "PRESTITO",
  "POLIZZA",
  "ALTRO",
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
 * Accetta "2500", "1.500,50", "1000+500", "1000+500 !" (stile note Filip).
 * Somma solo termini numerici; "!" e testo vengono ignorati.
 */
export function parseEuroExpression(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/!/g, " ").replace(/\s+/g, "");
  // 1.500,50 europeo → 1500.50
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  if (/^[+-]?(\d+(\.\d+)?)$/.test(s)) {
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }
  // Espressione tipo 1000+500 o 1000+500-100
  if (!/^[\d.+\-]+$/.test(s)) return null;
  const parts = s.match(/[+-]?[\d.]+/g);
  if (!parts?.length) return null;
  let sum = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}

/**
 * Fatturato pratica (formula Filip):
 * (POLIZZA / 2) + CQS + BANCA + CLIENTE + PRESTITI
 * Notaio escluso dal totale (campo a parte).
 * Funziona anche senza mutuo (solo CQS / prestiti / polizza).
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

/**
 * Calcola quota titolare e (eventuale) override nascosta per chi guarda.
 * L'override compare solo se il viewer ha overrideOnOthers > 0 e NON è il titolare.
 */
export function resolvePracticePayouts(params: {
  revenue: number;
  practiceBrokerId: string | null | undefined;
  practiceBrokerShare: number;
  viewerId: string;
  viewerOverrideOnOthers: number;
}): {
  brokerShare: number;
  brokerPayout: number;
  overrideShare: number;
  overridePayout: number;
  showOverride: boolean;
} {
  const brokerShare = Math.min(1, Math.max(0, params.practiceBrokerShare));
  const brokerPayout = params.revenue * brokerShare;
  const isOwn =
    params.practiceBrokerId != null &&
    params.practiceBrokerId === params.viewerId;
  const overrideShare = Math.min(
    1,
    Math.max(0, params.viewerOverrideOnOthers),
  );
  const showOverride = !isOwn && overrideShare > 0;
  return {
    brokerShare,
    brokerPayout,
    overrideShare,
    overridePayout: showOverride ? params.revenue * overrideShare : 0,
    showOverride,
  };
}

export function clampSharePercent(raw: unknown, fallback: number): number {
  let n =
    typeof raw === "number"
      ? raw
      : Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) n = fallback;
  if (n > 1) n /= 100;
  return Math.min(1, Math.max(0, n));
}

/** % ricavo su mutuo erogato (null se mutuo assente / 0   tipico CQS-only) */
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

export const LEAD_OUTCOMES = [
  { key: "NN_RISP", label: "Non risponde" },
  { key: "NN_INT", label: "Non interessato" },
  { key: "INT", label: "Interessato" },
  { key: "APP", label: "Appuntamento" },
] as const;

export type LeadOutcome = (typeof LEAD_OUTCOMES)[number]["key"];
