import type { Document, DocumentType } from "@/db/schema";

/** Data utile per confrontare due file dello stesso tipo (più recente = più alto). */
export function documentRecencyScore(doc: {
  createdAt: Date | string;
  extractedData?: {
    expiryDate?: string | null;
    referenceMonth?: string | null;
  } | null;
}): number {
  const fromExpiry = parseItDate(doc.extractedData?.expiryDate);
  if (fromExpiry) return fromExpiry;
  const fromMonth = parseMonthYear(doc.extractedData?.referenceMonth);
  if (fromMonth) return fromMonth;
  const c =
    doc.createdAt instanceof Date
      ? doc.createdAt.getTime()
      : new Date(doc.createdAt).getTime();
  return Number.isFinite(c) ? c : 0;
}

function parseItDate(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function parseMonthYear(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const lower = raw.toLowerCase();
  const months: Record<string, number> = {
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
  for (const [name, m] of Object.entries(months)) {
    const hit = lower.match(new RegExp(`${name}\\s*(\\d{4})`, "i"));
    if (hit) {
      return Date.UTC(Number(hit[1]), m - 1, 15);
    }
  }
  const dmy = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const ym = raw.match(/\b(20\d{2})[-/.]?(\d{1,2})\b/);
  if (ym) return Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 15);
  return null;
}

export type DuplicateRankInfo = {
  count: number;
  /** 1 = più recente del gruppo */
  rankByRecency: number;
  isNewest: boolean;
  isOldest: boolean;
};

/** Per ogni tipo con 2+ file, rank per data (1 = più recente). */
export function rankDuplicateDocuments(
  docs: Document[],
): Map<string, DuplicateRankInfo> {
  const byType = new Map<DocumentType, Document[]>();
  for (const d of docs) {
    if (d.documentType === "SCONOSCIUTO") continue;
    const list = byType.get(d.documentType) ?? [];
    list.push(d);
    byType.set(d.documentType, list);
  }

  const out = new Map<string, DuplicateRankInfo>();
  for (const [, group] of byType) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => documentRecencyScore(b) - documentRecencyScore(a),
    );
    sorted.forEach((doc, idx) => {
      out.set(doc.id, {
        count: group.length,
        rankByRecency: idx + 1,
        isNewest: idx === 0,
        isOldest: idx === sorted.length - 1,
      });
    });
  }
  return out;
}
