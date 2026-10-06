import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ne, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, systemSettings, users } from "@/db/schema";
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

type AppRow = {
  id: string;
  clientName: string;
  provenance: string | null;
  bankName: string | null;
  loanAmount: number | null;
  commissionClient: number | null;
  commissionBank: number | null;
  commissionPolicy: number | null;
  commissionCqs: number | null;
  commissionLoans: number | null;
  commissionNotary: number | null;
  rogitoAt: Date | null;
  updatedAt: Date;
  brokerId: string | null;
};

export default async function RogitatePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [viewer] = await db
    .select({
      id: users.id,
      payoutSharePercent: users.payoutSharePercent,
      overrideOnOthersPercent: users.overrideOnOthersPercent,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  const myShare = viewer?.payoutSharePercent ?? DEFAULT_COLLABORATOR_SHARE;
  const overrideShare = viewer?.overrideOnOthersPercent ?? 0;
  /** Override/quote personali solo broker   admin non ha partecipazione economica. */
  const canSeeOverride = session.role !== "ADMIN" && overrideShare > 0;

  const ownWhere =
    session.role === "ADMIN"
      ? and(eq(applications.status, "ROGITATA"), eq(applications.isTest, false))
      : and(
          eq(applications.status, "ROGITATA"),
          eq(applications.brokerId, session.id),
          eq(applications.isTest, false),
        );

  const selectCols = {
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
    brokerId: applications.brokerId,
  };

  const [rows, allUsers, settingsRow, othersRows] = await Promise.all([
    db
      .select(selectCols)
      .from(applications)
      .where(ownWhere)
      .orderBy(desc(applications.rogitoAt), desc(applications.updatedAt)),
    db
      .select({
        id: users.id,
        name: users.name,
        payoutSharePercent: users.payoutSharePercent,
      })
      .from(users),
    db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, "global"))
      .limit(1),
    canSeeOverride
      ? db
          .select(selectCols)
          .from(applications)
          .where(
            and(
              eq(applications.status, "ROGITATA"),
              eq(applications.isTest, false),
              isNotNull(applications.brokerId),
              ne(applications.brokerId, session.id),
            ),
          )
          .orderBy(desc(applications.rogitoAt), desc(applications.updatedAt))
      : Promise.resolve([] as AppRow[]),
  ]);

  const fallbackShare =
    settingsRow[0]?.collaboratorSharePercent ?? DEFAULT_COLLABORATOR_SHARE;

  function shareForBroker(brokerId: string | null): number {
    if (!brokerId) return fallbackShare;
    const u = allUsers.find((x) => x.id === brokerId);
    return u?.payoutSharePercent ?? fallbackShare;
  }

  type RowCalc = AppRow & {
    revenue: number;
    payout: number;
    onLoan: number | null;
    month: string;
    brokerName: string;
  };

  function calcRows(
    list: AppRow[],
    payoutShare: (r: AppRow) => number,
  ): RowCalc[] {
    return list.map((r) => {
      const revenue = practiceRevenue(r);
      const share = payoutShare(r);
      const when = r.rogitoAt ?? r.updatedAt;
      return {
        ...r,
        revenue,
        payout: collaboratorPayout(revenue, share),
        onLoan: revenueOnLoanPercent(revenue, r.loanAmount),
        month: monthKey(when),
        brokerName:
          allUsers.find((u) => u.id === r.brokerId)?.name ?? "n.d.",
      };
    });
  }

  // Admin vede tutte le pratiche con la quota del broker titolare.
  // Broker vede solo le sue con la sua quota.
  const calculated = calcRows(rows as AppRow[], (r) =>
    session.role === "ADMIN"
      ? shareForBroker(r.brokerId)
      : myShare,
  );

  const overrideRows = calcRows(othersRows as AppRow[], () => overrideShare);

  const byMonth = new Map<string, RowCalc[]>();
  for (const row of calculated) {
    const list = byMonth.get(row.month) ?? [];
    list.push(row);
    byMonth.set(row.month, list);
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  const grandRevenue = calculated.reduce((s, r) => s + r.revenue, 0);
  const grandPayout = calculated.reduce((s, r) => s + r.payout, 0);
  const overrideRevenue = overrideRows.reduce((s, r) => s + r.revenue, 0);
  const overridePayout = overrideRows.reduce((s, r) => s + r.payout, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Rogitate</h1>
        <p className="mt-2 text-slate-600">
          Resoconto pratiche chiuse.{" "}
          {session.role === "ADMIN" ? (
            <>Quote per broker (impostate in Utenti).</>
          ) : (
            <>
              La tua quota collaboratore{" "}
              <span className="font-semibold">
                {(myShare * 100).toFixed(0)}%
              </span>
              .
            </>
          )}
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
            {session.role === "ADMIN"
              ? "Totale quote broker"
              : "Quota collaboratore"}
          </p>
          <p className="mt-1 text-2xl font-bold text-primary-700">
            {formatEuro(grandPayout)}
          </p>
        </div>
      </div>

      {canSeeOverride ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Partecipazione riservata ({(overrideShare * 100).toFixed(0)}% su
            pratiche di altri)
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Visibile solo a te. I broker titolari non vedono questa voce.
          </p>
          <div className="mt-3 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-amber-800">Fatturato altri</p>
              <p className="text-xl font-bold text-amber-950">
                {formatEuro(overrideRevenue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-amber-800">La tua partecipazione</p>
              <p className="text-xl font-bold text-amber-950">
                {formatEuro(overridePayout)}
              </p>
            </div>
            <div>
              <p className="text-xs text-amber-800">Pratiche</p>
              <p className="text-xl font-bold text-amber-950">
                {overrideRows.length}
              </p>
            </div>
          </div>
          {overrideRows.length > 0 ? (
            <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto text-sm text-amber-950">
              {overrideRows.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <Link
                    href={`/dashboard/applications/${r.id}`}
                    className="font-medium underline"
                  >
                    {r.clientName}
                    <span className="ml-1 text-xs font-normal text-amber-800">
                      ({r.brokerName})
                    </span>
                  </Link>
                  <span>
                    {formatEuro(r.revenue)} → {formatEuro(r.payout)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-amber-800">
              Nessuna rogitata di altri broker ancora.
            </p>
          )}
        </div>
      ) : null}

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
                            : "n.d."}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {r.loanAmount != null
                            ? formatEuro(r.loanAmount)
                            : "n.d."}
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
                          {r.onLoan == null ? "n.d." : `${r.onLoan.toFixed(2)}%`}
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
