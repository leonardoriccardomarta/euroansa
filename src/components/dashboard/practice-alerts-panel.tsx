import Link from "next/link";
import type { PracticeAlert } from "@/lib/practice-alerts";

export function PracticeAlertsPanel({ alerts }: { alerts: PracticeAlert[] }) {
  if (!alerts.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Da seguire</h2>
        <p className="mt-2 text-sm text-slate-500">
          Nessuna pratica critica: tutti i documenti sono completi o inoltrati.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-slate-900">Da seguire</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pratiche critiche con documenti incompleti che richiedono intervento immediato.
        </p>
      </div>
      <ul className="space-y-2">
        {alerts.map((a) => (
          <li key={a.applicationId}>
            <Link
              href={`/dashboard/applications/${a.applicationId}`}
              className="block rounded-lg border border-amber-100 bg-white px-3 py-2.5 transition hover:border-amber-300"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">{a.clientName}</p>
                <p className="text-xs text-slate-500">
                  {a.statusLabel}
                  {a.daysStuck > 0 ? ` · ${a.daysStuck}g` : ""}
                </p>
              </div>
              <p className="mt-0.5 text-sm text-slate-700">{a.nextAction}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
