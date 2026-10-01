import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import {
  evaluateChecklist,
  inferEmploymentType,
} from "@/lib/checklist";
import {
  APPLICATION_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
} from "@/lib/config/documents";
import { refreshApplicationState } from "@/lib/pipeline";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "@/components/dashboard/application-actions";
import { DocumentUpload } from "@/components/dashboard/document-upload";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);

  if (!app) notFound();

  if (app.isTest && session.role !== "ADMIN") {
    redirect("/dashboard");
  }

  await refreshApplicationState(id);

  const [appFresh] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);
  if (!appFresh) notFound();
  const current = appFresh;

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, id))
    .orderBy(desc(documents.createdAt));

  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  const employmentType = inferEmploymentType(docs);
  const checklist = evaluateChecklist(employmentType, docs);
  const progressPct =
    checklist.totalRequired > 0
      ? (checklist.completedCount / checklist.totalRequired) * 100
      : 0;
  const scoring = current.preScoringData;
  const availableIncome = Math.max(
    (scoring?.net_monthly_income ?? 0) - (scoring?.monthly_obligations ?? 0),
    0,
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
            {current.clientName}
          </h1>
          <p className="mt-2 text-slate-600">
            {current.clientEmail}
            {current.clientFiscalCode ? ` · CF ${current.clientFiscalCode}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {current.isTest ? (
              <Badge
                variant="outline"
                className="border-violet-200 bg-violet-50 text-violet-700"
              >
                Test
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="border-primary-200 bg-primary-50 text-primary-700"
            >
              {APPLICATION_STATUS_LABELS[current.status] ?? current.status}
            </Badge>
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-50 text-slate-700"
            >
              {EMPLOYMENT_TYPE_LABELS[employmentType]}
            </Badge>
          </div>
        </div>
        <ApplicationActions applicationId={current.id} status={current.status} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Checklist
          </p>
          <p className="text-sm font-semibold text-slate-700">
            {checklist.progressLabel}
          </p>
        </div>
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
                className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
              >
                {ok ? (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-emerald-600"
                    aria-label="Presente e valido"
                  />
                ) : invalid ? (
                  <AlertCircle
                    className="h-4 w-4 shrink-0 text-amber-500"
                    aria-label="Presente ma non valido"
                  />
                ) : (
                  <Circle
                    className="h-4 w-4 shrink-0 text-slate-300"
                    aria-label="Mancante"
                  />
                )}
                <span className={ok ? "text-slate-800" : "text-slate-600"}>
                  {DOCUMENT_TYPE_LABELS[type]}
                </span>
              </li>
            );
          })}
        </ul>
        {(checklist.missing.length > 0 || checklist.invalid.length > 0) && (
          <p className="mt-4 text-sm text-slate-500">
            {checklist.missing.length > 0
              ? `Mancano: ${checklist.missing.map((t) => DOCUMENT_TYPE_LABELS[t]).join(", ")}.`
              : null}{" "}
            {checklist.invalid.length > 0
              ? `Da rifare: ${checklist.invalid.map((t) => DOCUMENT_TYPE_LABELS[t]).join(", ")}.`
              : null}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Netto mensile medio
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            €{(scoring?.net_monthly_income ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Obblighi mensili
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            €{(scoring?.monthly_obligations ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Rata max (35%)
          </p>
          <p className="mt-2 text-2xl font-bold text-primary-600">
            €{(scoring?.estimated_max_installment ?? 0).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            su disponibilità €{availableIncome.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
            Obblighi mensili stimati: €
            {scoring?.monthly_obligations.toFixed(2)} — riducono la rata
            massima sostenibile.
          </p>
        </div>
      )}

      {scoring?.notes && scoring.notes.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            Note e suggerimenti
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
            {scoring.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {current.driveFolderUrl && (
        <a
          href={current.driveFolderUrl}
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
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {DOCUMENT_TYPE_LABELS[doc.documentType]}
                    {doc.isValid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Originale: {doc.rawFileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Rinominato: {doc.renamedFileName}
                  </p>
                  {doc.extractedData && (
                    <p className="mt-2 text-xs text-slate-600">
                      {[
                        doc.extractedData.lastName || doc.extractedData.firstName
                          ? `${doc.extractedData.lastName ?? ""} ${doc.extractedData.firstName ?? ""}`.trim()
                          : null,
                        doc.extractedData.fiscalCode
                          ? `CF ${doc.extractedData.fiscalCode}`
                          : null,
                        doc.extractedData.referenceMonth
                          ? `Mese ${doc.extractedData.referenceMonth}`
                          : null,
                        typeof doc.extractedData.netSalary === "number"
                          ? `Netto €${doc.extractedData.netSalary.toFixed(2)}`
                          : null,
                        typeof doc.extractedData.grossIncomeAnnual === "number"
                          ? `Lordo €${doc.extractedData.grossIncomeAnnual.toFixed(2)}`
                          : null,
                        doc.extractedData.expiryDate
                          ? `Scad. ${doc.extractedData.expiryDate}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
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
            <DocumentUpload applicationId={current.id} />
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
