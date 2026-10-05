import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, systemSettings } from "@/db/schema";
import {
  DEFAULT_COLLABORATOR_SHARE,
  collaboratorPayout,
  formatEuro,
  monthKey,
  monthLabelIt,
  practiceRevenue,
  revenueOnLoanPercent,
} from "@/lib/economics";

export const dynamic = "force-dynamic";

export default async function RogitatePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const appWhere =
    session.role === "ADMIN"
      ? and(eq(applications.status, "ROGITATA"), eq(applications.isTest, false))
      : and(
          eq(applications.status, "ROGITATA"),
          eq(applications.brokerId, session.id),
          eq(applications.isTest, false),
        );

  const [rows, settingsRow] = await Promise.all([
    db
      .select({
        id: applications.id,
        clientName: applications.clientName,
        provenance: applications.provenance,
        bankName: applications.bankName,
        loanAmount: applications.loanAmount,
        commissionClient: applications.commissionClient,
        commissionBank: applications.commissionBank,
        commissionPolicy: applications.commissionPolicy,
        commissionCqs: applications.commissionCqs,
        commissionLoans: applications.commissionLoans,
        commissionNotary: applications.commissionNotary,
        rogitoAt: applications.rogitoAt,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .where(appWhere)
      .orderBy(desc(applications.rogitoAt), desc(applications.updatedAt)),
    db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, "global"))
      .limit(1),
  ]);

  const share =
    settingsRow[0]?.collaboratorSharePercent ?? DEFAULT_COLLABORATOR_SHARE;

  type RowCalc = (typeof rows)[number] & {
    revenue: number;
    payout: number;
    onLoan: number | null;
    month: string;
  };

  const calculated: RowCalc[] = rows.map((r) => {
    const revenue = practiceRevenue(r);
    const when = r.rogitoAt ?? r.updatedAt;
    return {
      ...r,
      revenue,
      payout: collaboratorPayout(revenue, share),
      onLoan: revenueOnLoanPercent(revenue, r.loanAmount),
      month: monthKey(when),
    };
  });

  const byMonth = new Map<string, RowCalc[]>();
  for (const row of calculated) {
    const list = byMonth.get(row.month) ?? [];
    list.push(row);
    byMonth.set(row.month, list);
  }

  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  const grandRevenue = calculated.reduce((s, r) => s + r.revenue, 0);
  const grandPayout = calculated.reduce((s, r) => s + r.payout, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Rogitate</h1>
        <p className="mt-2 text-slate-600">
          Resoconto automatico delle pratiche chiuse: totali per pratica e mese
          per mese. Quota collaboratore{" "}
          <span className="font-semibold">{(share * 100).toFixed(0)}%</span>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pratiche
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {calculated.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Fatturato totale
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">
            {formatEuro(grandRevenue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quota collaboratore
          </p>
          <p className="mt-1 text-2xl font-bold text-primary-700">
            {formatEuro(grandPayout)}
          </p>
        </div>
      </div>

      {months.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Nessuna pratica rogitata ancora. Quando imposti lo stato su Rogitata e
          salvi le provvigioni, compaiono qui mese per mese.
        </div>
      ) : (
        months.map((key) => {
          const list = byMonth.get(key)!;
          const monthRevenue = list.reduce((s, r) => s + r.revenue, 0);
          const monthPayout = list.reduce((s, r) => s + r.payout, 0);
          return (
            <section
              key={key}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                <div>
                  <h2 className="text-lg font-semibold capitalize text-slate-900">
                    {monthLabelIt(key)}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {list.length} pratic{list.length === 1 ? "a" : "he"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-emerald-800">
                    {formatEuro(monthRevenue)}
                  </p>
                  <p className="text-slate-500">
                    quota {formatEuro(monthPayout)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Rogito</th>
                      <th className="px-3 py-2 font-medium">Mutuo</th>
                      <th className="px-3 py-2 font-medium">Cliente €</th>
                      <th className="px-3 py-2 font-medium">Banca €</th>
                      <th className="px-3 py-2 font-medium">Polizza €</th>
                      <th className="px-3 py-2 font-medium">CQS €</th>
                      <th className="px-3 py-2 font-medium">Fatturato</th>
                      <th className="px-3 py-2 font-medium">Quota</th>
                      <th className="px-3 py-2 font-medium">% mutuo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/dashboard/applications/${r.id}`}
                            className="font-semibold text-primary-700 hover:underline"
                          >
                            {r.clientName}
                          </Link>
                          {r.provenance || r.bankName ? (
                            <p className="text-xs text-slate-500">
                              {[r.provenance, r.bankName]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {r.rogitoAt
                            ? new Date(r.rogitoAt).toLocaleDateString("it-IT")
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {r.loanAmount != null
                            ? formatEuro(r.loanAmount)
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {formatEuro(r.commissionClient ?? 0)}
                        </td>
                        <td className="px-3 py-2.5">
                          {formatEuro(r.commissionBank ?? 0)}
                        </td>
                        <td className="px-3 py-2.5">
                          {formatEuro(r.commissionPolicy ?? 0)}
                        </td>
                        <td className="px-3 py-2.5">
                          {formatEuro(r.commissionCqs ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-emerald-800">
                          {formatEuro(r.revenue)}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-primary-700">
                          {formatEuro(r.payout)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {r.onLoan == null ? "—" : `${r.onLoan.toFixed(2)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
