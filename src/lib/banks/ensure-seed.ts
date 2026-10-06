import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankPolicies } from "@/db/schema";
import { BANK_POLICY_SEEDS } from "@/lib/banks/seed-policies";

/**
 * Upsert completo dal seed (per slug). Aggiorna summary/rows/sortOrder
 * e inserisce banche mancanti. Non cancella banche aggiunte a mano.
 */
export async function syncBankPoliciesFromSeed(): Promise<{
  inserted: number;
  updated: number;
}> {
  let inserted = 0;
  let updated = 0;
  const existing = await db.select().from(bankPolicies);
  const bySlug = new Map(existing.map((r) => [r.slug, r]));
  const byName = new Map(
    existing.map((r) => [r.bankName.toLowerCase(), r]),
  );

  for (const seed of BANK_POLICY_SEEDS) {
    const hit =
      bySlug.get(seed.slug) ?? byName.get(seed.bankName.toLowerCase());
    if (hit) {
      await db
        .update(bankPolicies)
        .set({
          bankName: seed.bankName,
          slug: seed.slug,
          summary: seed.summary,
          rows: seed.rows,
          sortOrder: seed.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(bankPolicies.id, hit.id));
      updated += 1;
    } else {
      await db.insert(bankPolicies).values({
        bankName: seed.bankName,
        slug: seed.slug,
        summary: seed.summary,
        rows: seed.rows,
        sortOrder: seed.sortOrder,
      });
      inserted += 1;
    }
  }

  return { inserted, updated };
}

/**
 * Se la tabella è vuota, carica il seed.
 * Se è ancora il riassunto vecchio (< 20 voci), aggiorna al foglio completo.
 */
export async function ensureBankPolicySeed(): Promise<number> {
  const existing = await db.select().from(bankPolicies);
  if (existing.length === 0) {
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

  const maxRows = Math.max(
    ...existing.map((e) => (Array.isArray(e.rows) ? e.rows.length : 0)),
    0,
  );
  if (maxRows < 20) {
    const { inserted, updated } = await syncBankPoliciesFromSeed();
    return inserted + updated;
  }

  return 0;
}
