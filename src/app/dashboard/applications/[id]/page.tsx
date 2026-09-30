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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {app.clientName}
          </h1>
          <p className="text-sm text-slate-600">
            {app.clientEmail}
            {app.clientFiscalCode ? ` · CF ${app.clientFiscalCode}` : ""}
          </p>
          <div className="mt-2">
            <Badge>{APPLICATION_STATUS_LABELS[app.status] ?? app.status}</Badge>
          </div>
        </div>
        <ApplicationActions
          applicationId={app.id}
          status={app.status}
          employmentType={app.employmentType}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Checklist — {checklist.progressLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progressPct} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklist.required.map((type) => {
              const ok = checklist.presentValid.includes(type);
              const invalid = checklist.invalid.includes(type);
              return (
                <li
                  key={type}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <span>{ok ? "✅" : invalid ? "⚠️" : "⬜"}</span>
                  {DOCUMENT_TYPE_LABELS[type]}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">
              Netto mensile medio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              €{(scoring?.net_monthly_income ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">
              Rata max (35%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-800">
              €{(scoring?.estimated_max_installment ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">
              CUD / reddito lordo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              €{(scoring?.cud_gross_annual_income ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {(scoring?.monthly_obligations ?? 0) > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Trattenute rilevate</AlertTitle>
          <AlertDescription>
            Obblighi mensili stimati: €
            {scoring?.monthly_obligations.toFixed(2)}
          </AlertDescription>
        </Alert>
      )}

      {scoring?.notes && scoring.notes.length > 0 && (
        <Alert>
          <AlertTitle>Note pre-scoring</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4">
              {scoring.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {app.driveFolderUrl && (
        <a
          href={app.driveFolderUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800 hover:underline"
        >
          Apri cartella Google Drive <ExternalLink className="size-4" />
        </a>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documenti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {docs.length === 0 && (
            <p className="text-sm text-slate-500">Nessun documento caricato.</p>
          )}
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg border border-slate-200 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {DOCUMENT_TYPE_LABELS[doc.documentType]}{" "}
                    {doc.isValid ? (
                      <span className="text-emerald-700">✓</span>
                    ) : (
                      <span className="text-red-600">✗</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
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
                    className="text-sm text-emerald-800 hover:underline"
                  >
                    Anteprima
                  </a>
                )}
              </div>
              {doc.validationIssues?.length > 0 && (
                <div className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">
                  <ul className="list-disc pl-4">
                    {doc.validationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          <DocumentUpload applicationId={app.id} />
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        Broker: {settings?.brokerName ?? "Euroansa"} · Auto-invio segreteria:{" "}
        {settings?.autoSendToSecretary ? "ON" : "OFF"}
      </p>
    </div>
  );
}
