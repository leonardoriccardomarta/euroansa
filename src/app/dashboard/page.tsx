import Link from "next/link";
import { desc } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { evaluateChecklist } from "@/lib/checklist";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { Badge } from "@/components/ui/badge";
import { StatusFilter } from "@/components/dashboard/status-filter";

export const dynamic = "force-dynamic";

function statusBadgeClass(status: string) {
  if (status === "INVIATA_A_SEGRETERIA" || status === "DELIBERATA")
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "ANOMALIA" || status === "DOCUMENTI_INCOMPLETI")
    return "bg-red-100 text-red-800 border-red-200";
  if (status === "COMPLETA_DA_INOLTRARE")
    return "bg-primary-50 text-primary-700 border-primary-200";
  if (status === "INVIATA_IN_BANCA" || status === "PERITO_NOMINATO")
    return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const apps = await db
    .select()
    .from(applications)
    .orderBy(desc(applications.updatedAt));

  const allDocs = await db.select().from(documents);
  const docsByApp = new Map<string, typeof allDocs>();
  for (const d of allDocs) {
    const list = docsByApp.get(d.applicationId) ?? [];
    list.push(d);
    docsByApp.set(d.applicationId, list);
  }

  const filtered = status ? apps.filter((a) => a.status === status) : apps;

  const total = apps.length;
  const waiting = apps.filter(
    (a) =>
      a.status === "IN_ATTESA_DOCUMENTI" ||
      a.status === "DOCUMENTI_INCOMPLETI",
  ).length;
  const sent = apps.filter(
    (a) =>
      a.status === "INVIATA_A_SEGRETERIA" ||
      a.status === "INVIATA_IN_BANCA" ||
      a.status === "PERITO_NOMINATO" ||
      a.status === "DELIBERATA",
  ).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
          Pratiche
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Panoramica pratiche mutuo e avanzamento documenti
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Totale pratiche
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            In attesa documenti
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{waiting}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Inviate / in banca
          </p>
          <p className="mt-2 text-3xl font-bold text-primary-600">{sent}</p>
        </div>
      </div>

      <StatusFilter current={status} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-slate-900">Elenco pratiche</h2>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="font-medium text-slate-900">Nessuna pratica ancora</p>
            <p className="mt-2 text-sm text-slate-500">
              Le email con allegati verranno elaborate automaticamente dal
              polling.
            </p>
          </div>
        ) : (
          filtered.map((app) => {
            const docs = docsByApp.get(app.id) ?? [];
            const checklist = evaluateChecklist(app.employmentType, docs);
            const pct =
              checklist.totalRequired > 0
                ? (checklist.completedCount / checklist.totalRequired) * 100
                : 0;

            return (
              <div
                key={app.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/applications/${app.id}`}
                        className="truncate font-semibold text-slate-900 hover:text-primary-700"
                      >
                        {app.clientName}
                      </Link>
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(app.status)}
                      >
                        {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {app.clientEmail}
                      {app.clientFiscalCode ? ` · ${app.clientFiscalCode}` : ""}
                    </p>
                    <div className="mt-3 max-w-xs">
                      <div className="mb-1 flex justify-between text-xs text-slate-500">
                        <span>Checklist</span>
                        <span>{checklist.progressLabel}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-primary-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-2 text-sm sm:items-end">
                    <Link
                      href={`/dashboard/applications/${app.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      Apri pratica →
                    </Link>
                    <span className="text-slate-500">
                      {app.sentToSecretaryAt
                        ? `Segreteria: ${new Date(app.sentToSecretaryAt).toLocaleDateString("it-IT")}`
                        : "Non inviata a segreteria"}
                    </span>
                    {app.driveFolderUrl && (
                      <a
                        href={app.driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-primary-600 hover:underline"
                      >
                        Cartella Drive <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
