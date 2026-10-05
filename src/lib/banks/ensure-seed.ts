import { count } from "drizzle-orm";
import { db } from "@/db";
import { bankPolicies } from "@/db/schema";
import { BANK_POLICY_SEEDS } from "@/lib/banks/seed-policies";

/** Se la tabella è vuota, carica il seed scheda banche. */
export async function ensureBankPolicySeed(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(bankPolicies);
  if ((row?.n ?? 0) > 0) return 0;

  await db.insert(bankPolicies).values(
    BANK_POLICY_SEEDS.map((b) => ({
      bankName: b.bankName,
      slug: b.slug,
      summary: b.summary,
      rows: b.rows,
      sortOrder: b.sortOrder,
    })),
  );
  return BANK_POLICY_SEEDS.length;
}
