import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { bankPolicies } from "@/db/schema";
import { ensureBankPolicySeed } from "@/lib/banks/ensure-seed";
import { BanksClient } from "@/components/dashboard/banks-client";

export const dynamic = "force-dynamic";

export default async function BanchePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  await ensureBankPolicySeed();
  const rows = await db
    .select()
    .from(bankPolicies)
    .orderBy(asc(bankPolicies.sortOrder), asc(bankPolicies.bankName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Banche</h1>
        <p className="mt-2 text-slate-600">
          Scheda policy completa per istituto (matrice foglio SCHEDA BANCHE:
          durata, garanti, contratti, CONSAP, costi…). Consultazione in pratica
          e qui.
        </p>
      </div>
      <BanksClient rows={rows} isAdmin={session.role === "ADMIN"} />
    </div>
  );
}
