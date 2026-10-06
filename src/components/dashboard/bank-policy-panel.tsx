"use client";

import Link from "next/link";
import type { BankPolicyRow } from "@/db/schema";

export type BankPolicyOption = {
  bankName: string;
  summary: string | null;
  rows: BankPolicyRow[];
  detailText: string | null;
};

function matchBank(
  banks: BankPolicyOption[],
  bankName: string | null,
): BankPolicyOption | null {
  if (!bankName?.trim()) return null;
  const needle = bankName.trim().toLowerCase();
  return (
    banks.find((b) => b.bankName.toLowerCase() === needle) ??
    banks.find(
      (b) =>
        b.bankName.toLowerCase().includes(needle) ||
        needle.includes(b.bankName.toLowerCase()),
    ) ??
    null
  );
}

export function BankPolicyPanel({
  banks,
  bankName,
}: {
  banks: BankPolicyOption[];
  bankName: string | null;
}) {
  if (!bankName?.trim()) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Scegli una banca nel preventivo per vedere la policy.{" "}
        <Link href="/dashboard/banche" className="font-medium text-primary-700 underline">
          Apri scheda banche
        </Link>
      </div>
    );
  }

  const match = matchBank(banks, bankName);

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
      <div className="mt-3 max-h-96 space-y-3 overflow-y-auto text-sm">
        {match.rows.length > 0 ? (
          <dl className="space-y-2">
            {match.rows.map((row, idx) => (
              <div
                key={`${row.label}-${idx}`}
                className="grid gap-0.5 sm:grid-cols-[160px_1fr]"
              >
                <dt className="text-xs font-semibold uppercase text-slate-500">
                  {row.label}
                </dt>
                <dd className="whitespace-pre-wrap text-slate-800">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {match.detailText ? (
          <pre className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 font-sans text-xs leading-relaxed text-slate-700">
            {match.detailText}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
