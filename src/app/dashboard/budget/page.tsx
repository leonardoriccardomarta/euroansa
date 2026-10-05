import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import {
  applications,
  systemSettings,
  DEFAULT_BUDGET_TARGETS,
  type BudgetTargets,
} from "@/db/schema";
import { BudgetForm } from "@/components/dashboard/budget-form";
import {
  DEFAULT_COLLABORATOR_SHARE,
  formatEuro,
  practiceRevenue,
} from "@/lib/economics";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
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

  const [rogitate, settingsRow] = await Promise.all([
    db.select().from(applications).where(appWhere),
    db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, "global"))
      .limit(1),
  ]);

  const settings = settingsRow[0];
  const targets: BudgetTargets =
    settings?.budgetTargets ?? DEFAULT_BUDGET_TARGETS;
  const share =
    settings?.collaboratorSharePercent ?? DEFAULT_COLLABORATOR_SHARE;
  const year = settings?.budgetYear ?? "2026";

  let mutuiErogato = 0;
  let mutuiPezzi = 0;
  let cqsPayin = 0;
  let cqsPezzi = 0;
  let polizzePayin = 0;
  let polizzePezzi = 0;
  let prestitiPayin = 0;
  let prestitiPezzi = 0;
  let totalRevenue = 0;

  for (const r of rogitate) {
    const rev = practiceRevenue(r);
    totalRevenue += rev;
    const op = (r.operationType ?? "MUTUO").toUpperCase();
    if (op.includes("MUTUO") || op.includes("SURROGA")) {
      mutuiErogato += r.loanAmount ?? 0;
      mutuiPezzi += 1;
    }
    if ((r.commissionCqs ?? 0) > 0 || op.includes("CQS")) {
      cqsPayin += r.commissionCqs ?? 0;
      cqsPezzi += 1;
    }
    if ((r.commissionPolicy ?? 0) > 0 || op.includes("POLIZZA")) {
      polizzePayin += r.commissionPolicy ?? 0;
      polizzePezzi += 1;
    }
    if ((r.commissionLoans ?? 0) > 0 || op.includes("PRESTITO")) {
      prestitiPayin += r.commissionLoans ?? 0;
      prestitiPezzi += 1;
    }
  }

  const mutuiPayinAtteso = targets.mutui.erogato * targets.mutui.rate;
  const cqsPayinAtteso = targets.cqs.erogato * targets.cqs.rate;
  const polizzePayinAtteso = targets.polizze.erogato * targets.polizze.rate;
  const prestitiPayinAtteso = targets.prestiti.erogato * targets.prestiti.rate;

  // Mutui payin effettivo ≈ revenue totale meno linee prodotto dedicate
  const mutuiPayinEffettivo = Math.max(
    0,
    totalRevenue - cqsPayin - polizzePayin / 2 - prestitiPayin,
  );

  const rows = [
    {
      key: "mutui",
      label: "MUTUI",
      erogatoTarget: targets.mutui.erogato,
      erogatoEff: mutuiErogato,
      pezziTarget: targets.mutui.pezzi,
      pezziEff: mutuiPezzi,
      rate: targets.mutui.rate,
      payinAtteso: mutuiPayinAtteso,
      payinEff: mutuiPayinEffettivo,
    },
    {
      key: "cqs",
      label: "CQS",
      erogatoTarget: targets.cqs.erogato,
      erogatoEff: cqsPayin / Math.max(targets.cqs.rate, 0.0001),
      pezziTarget: targets.cqs.pezzi,
      pezziEff: cqsPezzi,
      rate: targets.cqs.rate,
      payinAtteso: cqsPayinAtteso,
      payinEff: cqsPayin,
    },
    {
      key: "polizze",
      label: "POLIZZE",
      erogatoTarget: targets.polizze.erogato,
      erogatoEff: polizzePayin,
      pezziTarget: targets.polizze.pezzi,
      pezziEff: polizzePezzi,
      rate: targets.polizze.rate,
      payinAtteso: polizzePayinAtteso,
      payinEff: polizzePayin,
    },
    {
      key: "prestiti",
      label: "PRESTITI",
      erogatoTarget: targets.prestiti.erogato,
      erogatoEff: prestitiPayin / Math.max(targets.prestiti.rate, 0.0001),
      pezziTarget: targets.prestiti.pezzi,
      pezziEff: prestitiPezzi,
      rate: targets.prestiti.rate,
      payinAtteso: prestitiPayinAtteso,
      payinEff: prestitiPayin,
    },
  ];

  const totAtteso = rows.reduce((s, r) => s + r.payinAtteso, 0);
  const totEff = rows.reduce((s, r) => s + r.payinEff, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Budget {year}</h1>
        <p className="mt-2 text-slate-600">
          Target annuali vs effettivo dalle pratiche{" "}
          <strong>Rogitate</strong>. Quota collaboratore{" "}
          {(share * 100).toFixed(0)}% →{" "}
          <strong>{formatEuro(totEff * share)}</strong> su payin effettivo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Payin atteso
          </p>
          <p className="mt-1 text-2xl font-bold">{formatEuro(totAtteso)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Payin effettivo
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">
            {formatEuro(totEff)}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Differenza
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${totEff - totAtteso >= 0 ? "text-emerald-700" : "text-red-700"}`}
          >
            {formatEuro(totEff - totAtteso)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Prodotto</th>
              <th className="px-3 py-2">Erogato tgt / eff</th>
              <th className="px-3 py-2">Pezzi tgt / eff</th>
              <th className="px-3 py-2">Aliquota</th>
              <th className="px-3 py-2">Payin atteso</th>
              <th className="px-3 py-2">Payin eff.</th>
              <th className="px-3 py-2">Diff</th>
              <th className="px-3 py-2">Tua quota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-50">
                <td className="px-3 py-2 font-semibold">{r.label}</td>
                <td className="px-3 py-2">
                  {formatEuro(r.erogatoTarget)} / {formatEuro(r.erogatoEff)}
                </td>
                <td className="px-3 py-2">
                  {r.pezziTarget} / {r.pezziEff}
                </td>
                <td className="px-3 py-2">{(r.rate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">{formatEuro(r.payinAtteso)}</td>
                <td className="px-3 py-2 font-medium text-emerald-800">
                  {formatEuro(r.payinEff)}
                </td>
                <td className="px-3 py-2">
                  {formatEuro(r.payinEff - r.payinAtteso)}
                </td>
                <td className="px-3 py-2 font-semibold text-primary-700">
                  {formatEuro(r.payinEff * share)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {session.role === "ADMIN" ? (
        <BudgetForm targets={targets} year={year} />
      ) : (
        <p className="text-sm text-slate-500">
          Solo l&apos;admin può modificare i target annuali.
        </p>
      )}
    </div>
  );
}
