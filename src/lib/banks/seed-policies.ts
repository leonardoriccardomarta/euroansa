import type { BankPolicyRow } from "@/db/schema";
import seedData from "@/lib/banks/seed-data.json";

export type BankSeed = {
  bankName: string;
  slug: string;
  summary: string;
  sortOrder: number;
  rows: BankPolicyRow[];
  detailText?: string | null;
};

/** Seed completo da foglio SCHEDA BANCHE (matrice + tab per istituto). */
export const BANK_POLICY_SEEDS: BankSeed[] = seedData.map((b) => ({
  bankName: b.bankName,
  slug: b.slug,
  summary: b.summary,
  sortOrder: b.sortOrder,
  rows: b.rows as BankPolicyRow[],
  detailText: b.detailText ?? null,
}));
