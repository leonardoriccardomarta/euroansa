import Link from "next/link";
import { db } from "@/db";
import { bankPolicies } from "@/db/schema";
import { ensureBankPolicySeed } from "@/lib/banks/ensure-seed";

export async function BankPolicyPanel({ bankName }: { bankName: string | null }) {
  if (!bankName?.trim()) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Imposta la banca nella scheda economia per vedere la policy inline.{" "}
        <Link href="/dashboard/banche" className="font-medium text-primary-700 underline">
          Apri scheda banche
        </Link>
      </div>
    );
  }

  await ensureBankPolicySeed();
  const needle = bankName.trim().toLowerCase();
  const all = await db.select().from(bankPolicies);
  const match =
    all.find((b) => b.bankName.toLowerCase() === needle) ??
    all.find(
      (b) =>
        b.bankName.toLowerCase().includes(needle) ||
        needle.includes(b.bankName.toLowerCase()),
    );

  if (!match) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Nessuna scheda per «{bankName}».{" "}
        <Link href="/dashboard/banche" className="font-medium underline">
          Cerca / aggiungi in Banche
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Policy banca
          </p>
          <h3 className="text-lg font-bold text-slate-900">{match.bankName}</h3>
          {match.summary ? (
            <p className="mt-1 text-sm text-slate-600">{match.summary}</p>
          ) : null}
        </div>
        <Link
          href="/dashboard/banche"
          className="text-sm font-medium text-primary-700 underline"
        >
          Scheda completa
        </Link>
      </div>
      <dl className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
        {match.rows.map((row, idx) => (
          <div
            key={`${row.label}-${idx}`}
            className="grid gap-0.5 sm:grid-cols-[160px_1fr]"
          >
            <dt className="text-xs font-semibold uppercase text-slate-500">
              {row.label}
            </dt>
            <dd className="whitespace-pre-wrap text-slate-800">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
