import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import { evaluateChecklist } from "@/lib/checklist";
import {
  APPLICATION_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/config/documents";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "@/components/dashboard/application-actions";
import { DocumentUpload } from "@/components/dashboard/document-upload";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);

  if (!app) notFound();

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, id));

  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  const checklist = evaluateChecklist(app.employmentType, docs);
  const progressPct =
    checklist.totalRequired > 0
      ? (checklist.completedCount / checklist.totalRequired) * 100
      : 0;
  const scoring = app.preScoringData;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
            {app.clientName}
          </h1>
          <p className="mt-2 text-slate-600">
            {app.clientEmail}
            {app.clientFiscalCode ? ` · CF ${app.clientFiscalCode}` : ""}
          </p>
          <div className="mt-3">
            <Badge
              variant="outline"
              className="border-primary-200 bg-primary-50 text-primary-700"
            >
              {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
            </Badge>
          </div>
        </div>
        <ApplicationActions
          applicationId={app.id}
          status={app.status}
          employmentType={app.employmentType}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Checklist {checklist.progressLabel}
        </p>
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-primary-600 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {checklist.required.map((type) => {
            const ok = checklist.presentValid.includes(type);
            const invalid = checklist.invalid.includes(type);
            return (
              <li
                key={type}
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                <span>{ok ? "✅" : invalid ? "⚠️" : "⬜"}</span>
                {DOCUMENT_TYPE_LABELS[type]}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Netto mensile medio
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            €{(scoring?.net_monthly_income ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Rata max (35%)
          </p>
          <p className="mt-2 text-2xl font-bold text-primary-600">
            €{(scoring?.estimated_max_installment ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            CUD / reddito lordo
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            €{(scoring?.cud_gross_annual_income ?? 0).toFixed(2)}
          </p>
        </div>
      </div>

      {(scoring?.monthly_obligations ?? 0) > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Trattenute rilevate</p>
          <p className="mt-1 text-sm">
            Obblighi mensili stimati: €{scoring?.monthly_obligations.toFixed(2)}
          </p>
        </div>
      )}

      {scoring?.notes && scoring.notes.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Note pre-scoring</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
            {scoring.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {app.driveFolderUrl && (
        <a
          href={app.driveFolderUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:underline"
        >
          Apri cartella Google Drive <ExternalLink className="h-4 w-4" />
        </a>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold text-slate-900">Documenti</h2>
        <div className="space-y-3">
          {docs.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Nessun documento caricato.
            </div>
          )}
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {DOCUMENT_TYPE_LABELS[doc.documentType]}{" "}
                    {doc.isValid ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-red-600">✗</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Originale: {doc.rawFileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Rinominato: {doc.renamedFileName}
                  </p>
                </div>
                {doc.driveFileUrl && (
                  <a
                    href={doc.driveFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary-600 hover:underline"
                  >
                    Anteprima
                  </a>
                )}
              </div>
              {doc.validationIssues?.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <ul className="list-disc pl-4">
                    {doc.validationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <DocumentUpload applicationId={app.id} />
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Broker: {settings?.brokerName ?? "Euroansa"} · Auto-invio segreteria:{" "}
        {settings?.autoSendToSecretary ? "ON" : "OFF"}
      </p>
    </div>
  );
}
