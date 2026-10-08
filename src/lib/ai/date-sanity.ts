/**
 * Gemini a volte inventa "documento futuro" su mesi già passati.
 * Filtra validationIssues incoerenti rispetto a oggi (Europe/Rome).
 */

function romeParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), day: get("day") };
}

const MONTH_IT: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

/** True se year-month ≤ mese corrente (Roma). */
function ymNotFuture(year: number, month: number): boolean {
  const { y, m } = romeParts();
  if (year < y) return true;
  if (year > y) return false;
  return month <= m;
}

function parseYmFromText(text: string): { y: number; m: number } | null {
  const lower = text.toLowerCase();
  for (const [name, m] of Object.entries(MONTH_IT)) {
    const re = new RegExp(`${name}\\s*(\\d{4})`, "i");
    const hit = lower.match(re);
    if (hit) return { y: Number(hit[1]), m };
  }
  const dmy = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) return { y: Number(dmy[3]), m: Number(dmy[2]) };
  const ym = text.match(/\b(20\d{2})-(\d{2})\b/);
  if (ym) return { y: Number(ym[1]), m: Number(ym[2]) };
  return null;
}

/** Rimuove avvisi "futuro/anomalo" se il periodo è già trascorso o corrente. */
export function sanitizeAiValidationIssues(issues: string[]): string[] {
  return issues.filter((issue) => {
    const lower = issue.toLowerCase();
    const aboutFuture =
      lower.includes("futur") ||
      lower.includes("anomala") ||
      lower.includes("anomalo");
    if (!aboutFuture) return true;
    const ym = parseYmFromText(issue);
    if (!ym) return true;
    // Se il periodo non è futuro → droppa l'avviso spurio
    if (ymNotFuture(ym.y, ym.m)) return false;
    return true;
  });
}

/** Confronta expiry GG/MM/AAAA con oggi Roma. */
export function isExpiryBeforeToday(expiryGgMmAaaa: string | null | undefined): boolean {
  if (!expiryGgMmAaaa?.trim()) return false;
  const m = expiryGgMmAaaa.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const { y, m: tm, day: td } = romeParts();
  if (year < y) return true;
  if (year > y) return false;
  if (month < tm) return true;
  if (month > tm) return false;
  return day < td;
}
