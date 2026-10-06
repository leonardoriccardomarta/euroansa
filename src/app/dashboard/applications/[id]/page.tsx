import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import {
  applications,
  documents,
  secretarySendLogs,
  systemSettings,
  users,
} from "@/db/schema";
import {
  evaluateChecklist,
  inferEmploymentType,
} from "@/lib/checklist";
import {
  DOCUMENT_TYPE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  STORAGE_FOLDER_KINDS,
  sheetRowsForRequired,
  storageSubfolderLabel,
} from "@/lib/config/documents";
import { isLegacyDriveKey, isSiteStorageKey } from "@/lib/storage/paths";
import { PACKAGE_LINK_TTL_DAYS } from "@/lib/db/setup-statements";
import { isTutorialPractice } from "@/lib/tutorial";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "@/components/dashboard/application-actions";
import { ClosedPracticeCleanup } from "@/components/dashboard/closed-practice-cleanup";
import { DocumentPreviewButton } from "@/components/dashboard/document-preview";
import { DocumentUpload } from "@/components/dashboard/document-upload";
import { RelazioneStudio } from "@/components/dashboard/relazione-studio";
import { PreventivoForm } from "@/components/dashboard/preventivo-form";
import { BankPolicyPanel } from "@/components/dashboard/bank-policy-panel";
import { RequiredDocsEditor } from "@/components/dashboard/required-docs-editor";
import { PracticeEconomicsForm } from "@/components/dashboard/practice-economics-form";
import { TutorialPracticeBanner } from "@/components/onboarding/tutorial-practice-banner";
import {
  DEFAULT_COLLABORATOR_SHARE,
  DEFAULT_PROVENANCE_OPTIONS,
} from "@/lib/economics";

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
  // Broker minori: solo pratiche assegnate
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    redirect("/dashboard");
  }

  // Refresh stato solo dopo upload/mutazioni (pipeline), non a ogni apertura pagina
  const current = app;

  const [docs, sendLogs, settingsRow, allUsers] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, id))
      .orderBy(desc(documents.createdAt)),
    db
      .select()
      .from(secretarySendLogs)
      .where(eq(secretarySendLogs.applicationId, id))
      .orderBy(desc(secretarySendLogs.createdAt))
      .limit(8),
    db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, "global"))
      .limit(1),
    db
      .select({
        id: users.id,
        name: users.name,
        payoutSharePercent: users.payoutSharePercent,
        overrideOnOthersPercent: users.overrideOnOthersPercent,
      })
      .from(users),
  ]);

  const [settings] = settingsRow;

  const brokerName = current.brokerId
    ? allUsers.find((b) => b.id === current.brokerId)?.name
    : null;

  const practiceBroker = current.brokerId
    ? allUsers.find((b) => b.id === current.brokerId)
    : null;
  const viewer = allUsers.find((b) => b.id === session.id);
  const practiceBrokerShare =
    practiceBroker?.payoutSharePercent ??
    settings?.collaboratorSharePercent ??
    DEFAULT_COLLABORATOR_SHARE;
  const viewerOverride = viewer?.overrideOnOthersPercent ?? 0;
  const showHiddenOverride =
    session.role !== "ADMIN" &&
    viewerOverride > 0 &&
    Boolean(current.brokerId) &&
    current.brokerId !== session.id;

  const legacyDocs = docs.filter((d) => isLegacyDriveKey(d.driveFileId));
  const missingStorageDocs = docs.filter(
    (d) => !d.driveFileId || !isSiteStorageKey(d.driveFileId),
  );
  const packageExpired =
    Boolean(current.packageTokenExpiresAt) &&
    current.packageTokenExpiresAt!.getTime() < Date.now();

  const employmentType = inferEmploymentType(docs);
  const checklist = evaluateChecklist(current.requiredDocumentTypes, docs);
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
      {isTutorialPractice(current) ? <TutorialPracticeBanner /> : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
            {current.clientName}
          </h1>
          <p className="mt-2 text-slate-600">
            {current.clientEmail}
            {current.clientFiscalCode ? `, CF ${current.clientFiscalCode}` : ""}
            {brokerName ? `, ${brokerName}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isTutorialPractice(current) ? (
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-800"
              >
                Guida
              </Badge>
            ) : null}
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
              className="border-slate-200 bg-slate-50 text-slate-700"
            >
              {EMPLOYMENT_TYPE_LABELS[employmentType]}
            </Badge>
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <ApplicationActions
            applicationId={current.id}
            status={current.status}
            isAdmin={session.role === "ADMIN"}
            clientName={current.clientName}
            hasRelazione={Boolean(
              current.relazioneStorageKey &&
                isSiteStorageKey(current.relazioneStorageKey),
            )}
            hasPackageLink={Boolean(current.packageToken)}
          />
        </div>
      </div>

      {current.lastPipelineError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Operazione fallita — riprova</p>
          <p className="mt-1">{current.lastPipelineError}</p>
          {current.lastPipelineErrorAt ? (
            <p className="mt-1 text-xs text-red-700">
              {new Date(current.lastPipelineErrorAt).toLocaleString("it-IT")}
            </p>
          ) : null}
        </div>
      ) : null}

      {legacyDocs.length > 0 || missingStorageDocs.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">
            File non sullo storage sito ({legacyDocs.length || missingStorageDocs.length})
          </p>
          <p className="mt-1">
            File vecchi (Drive / storage precedente) non finiscono nello ZIP
            segreteria. Usa <strong>Sostituisci</strong> o ricarica i PDF in
            File / qui sotto.
          </p>
        </div>
      ) : null}

      {current.packageToken ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Link pacchetto
          </p>
          <p className="mt-1">
            {packageExpired ? (
              <span className="font-medium text-amber-700">Scaduto</span>
            ) : current.packageTokenExpiresAt ? (
              <>
                Valido fino al{" "}
                {new Date(current.packageTokenExpiresAt).toLocaleString("it-IT")}{" "}
                ({PACKAGE_LINK_TTL_DAYS} giorni)
              </>
            ) : (
              "Attivo"
            )}
            {current.sentToSecretaryByName
              ? ` · ultimo invio: ${current.sentToSecretaryByName}`
              : null}
            {current.sentToSecretaryAt
              ? ` (${new Date(current.sentToSecretaryAt).toLocaleString("it-IT")})`
              : null}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <RequiredDocsEditor
          applicationId={current.id}
          requiredDocumentTypes={current.requiredDocumentTypes ?? []}
          suggestedPreset={employmentType}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Stato documenti
          </p>
          <p className="text-sm font-semibold text-slate-700">
            {checklist.progressLabel}
          </p>
        </div>
        {checklist.isUnset ? (
          <p className="mt-3 text-sm text-amber-700">
            Seleziona sopra le voci del foglio documenti richieste per questa
            pratica.
          </p>
        ) : (
          <>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-primary-600 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {sheetRowsForRequired(checklist.required).map((row) => {
                const ok = row.types.every((t) =>
                  checklist.presentValid.includes(t),
                );
                const invalid = row.types.some((t) =>
                  checklist.invalid.includes(t),
                );
                const partial =
                  !ok &&
                  row.types.some(
                    (t) =>
                      checklist.presentValid.includes(t) ||
                      checklist.invalid.includes(t),
                  );
                return (
                  <li
                    key={`${row.label}-${row.types.join("-")}`}
                    className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-medium uppercase text-slate-700 sm:text-[13px]"
                  >
                    {ok ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-emerald-600"
                        aria-label="Presente e valido"
                      />
                    ) : invalid || partial ? (
                      <AlertCircle
                        className="h-4 w-4 shrink-0 text-amber-500"
                        aria-label="Incompleto o non valido"
                      />
                    ) : (
                      <Circle
                        className="h-4 w-4 shrink-0 text-slate-300"
                        aria-label="Mancante"
                      />
                    )}
                    <span className={ok ? "text-slate-800" : "text-slate-600"}>
                      {row.label}
                      {row.types.length > 1
                        ? ` (${row.types.filter((t) => checklist.presentValid.includes(t)).length}/${row.types.length})`
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
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
            CUD reddito lordo
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
            {scoring?.monthly_obligations.toFixed(2)}. Riducono la rata
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

      <RelazioneStudio
        applicationId={current.id}
        hasRelazione={Boolean(
          current.relazioneStorageKey &&
            isSiteStorageKey(current.relazioneStorageKey),
        )}
        fileName={current.relazioneFileName}
        uploadedAt={current.relazioneUploadedAt}
        initialDraft={current.relazioneDraftText}
      />

      <PreventivoForm
        applicationId={current.id}
        clientName={current.clientName}
        defaults={{
          ...(current.preventivoData ?? {}),
          bankName: current.preventivoData?.bankName ?? current.bankName,
          propertyAmount:
            current.preventivoData?.propertyAmount ?? current.propertyAmount,
          loanAmount: current.preventivoData?.loanAmount ?? current.loanAmount,
        }}
        hasPdf={Boolean(
          current.preventivoStorageKey &&
            isSiteStorageKey(current.preventivoStorageKey),
        )}
        fileName={current.preventivoFileName}
      />

      <BankPolicyPanel bankName={current.bankName} />

      <section id="files">
        <h2 className="mb-2 text-xl font-bold text-slate-900">
          Cartella documenti
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Cartelle:{" "}
          {STORAGE_FOLDER_KINDS.map((k) =>
            storageSubfolderLabel(k, current.clientName),
          ).join(", ")}
          {", relazione"}
        </p>
        <div className="space-y-3">
          {docs.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Nessun documento caricato.
            </div>
          )}
          {(() => {
            const defaultDocLabel = storageSubfolderLabel(
              "DOC",
              current.clientName,
            );
            const byFolder = new Map<string, typeof docs>();
            for (const doc of docs) {
              const key = doc.storageSubfolder?.trim() || defaultDocLabel;
              const list = byFolder.get(key) ?? [];
              list.push(doc);
              byFolder.set(key, list);
            }
            const orderedLabels = [
              ...STORAGE_FOLDER_KINDS.map((k) =>
                storageSubfolderLabel(k, current.clientName),
              ),
              ...[...byFolder.keys()].filter(
                (k) =>
                  !STORAGE_FOLDER_KINDS.map((kind) =>
                    storageSubfolderLabel(kind, current.clientName),
                  ).includes(k),
              ),
            ];
            return orderedLabels.map((label) => {
              const list = byFolder.get(label);
              if (!list?.length) return null;
              return (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <div className="space-y-3">
                    {list.map((doc) => (
                      <div
                        key={doc.id}
                        className="border-t border-slate-100 pt-3 first:border-0 first:pt-0"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                              {DOCUMENT_TYPE_LABELS[doc.documentType]}
                              {doc.isValid ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                              {isLegacyDriveKey(doc.driveFileId) ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-200 bg-amber-50 text-amber-800"
                                >
                                  Solo Drive — ricarica
                                </Badge>
                              ) : doc.filePurged ? (
                                <Badge
                                  variant="outline"
                                  className="border-slate-200 bg-slate-50 text-slate-600"
                                >
                                  Storico
                                </Badge>
                              ) : doc.keptForHistory ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-emerald-50 text-emerald-800"
                                >
                                  Tenuto
                                </Badge>
                              ) : !doc.driveFileId ? (
                                <Badge
                                  variant="outline"
                                  className="border-red-200 bg-red-50 text-red-700"
                                >
                                  Non in storage
                                </Badge>
                              ) : null}
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
                                  doc.extractedData.lastName ||
                                  doc.extractedData.firstName
                                    ? `${doc.extractedData.lastName ?? ""} ${doc.extractedData.firstName ?? ""}`.trim()
                                    : null,
                                  doc.extractedData.fiscalCode
                                    ? `CF ${doc.extractedData.fiscalCode}`
                                    : null,
                                  doc.extractedData.referenceMonth
                                    ? `Mese ${doc.extractedData.referenceMonth}`
                                    : null,
                                  typeof doc.extractedData.netSalary ===
                                  "number"
                                    ? `Netto €${doc.extractedData.netSalary.toFixed(2)}`
                                    : null,
                                  typeof doc.extractedData
                                    .grossIncomeAnnual === "number"
                                    ? `Lordo €${doc.extractedData.grossIncomeAnnual.toFixed(2)}`
                                    : null,
                                  doc.extractedData.expiryDate
                                    ? `Scad. ${doc.extractedData.expiryDate}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                          {doc.driveFileUrl &&
                          isSiteStorageKey(doc.driveFileId) ? (
                            <DocumentPreviewButton
                              src={doc.driveFileUrl}
                              fileName={doc.renamedFileName}
                              label="Anteprima"
                            />
                          ) : null}
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
                  </div>
                </div>
              );
            });
          })()}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <DocumentUpload applicationId={current.id} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Economia e audit
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Provvigioni e spunte conformità — da compilare a mano (il sistema non
          le conosce). Totale e quota si calcolano in automatico.
        </p>
        <div className="mt-5">
          <PracticeEconomicsForm
            applicationId={current.id}
            collaboratorSharePercent={practiceBrokerShare}
            showOverride={showHiddenOverride}
            overrideSharePercent={viewerOverride}
            provenanceOptions={
              settings?.provenanceOptions?.length
                ? settings.provenanceOptions
                : [...DEFAULT_PROVENANCE_OPTIONS]
            }
            values={{
              clientName: current.clientName,
              clientEmail: current.clientEmail,
              provenance: current.provenance,
              bankName: current.bankName,
              operationType: current.operationType,
              phone: current.phone,
              loanAmount: current.loanAmount,
              propertyAmount: current.propertyAmount,
              ltvPercent: current.ltvPercent,
              notaryName: current.notaryName,
              appraiserName: current.appraiserName,
              commissionClient: current.commissionClient,
              commissionBank: current.commissionBank,
              commissionPolicy: current.commissionPolicy,
              commissionCqs: current.commissionCqs,
              commissionLoans: current.commissionLoans,
              commissionNotary: current.commissionNotary,
              rogitoAt: current.rogitoAt,
              auditPrivacy: current.auditPrivacy,
              auditContractSigned: current.auditContractSigned,
              auditInstituteSheet: current.auditInstituteSheet,
              auditDdmBank: current.auditDdmBank,
              auditOriginalsVerified: current.auditOriginalsVerified,
              auditArchive: current.auditArchive,
              economicNotes: current.economicNotes,
            }}
          />
        </div>
      </section>

      {current.status === "ROGITATA" ? (
        <ClosedPracticeCleanup
          applicationId={current.id}
          documents={docs.map((d) => ({
            id: d.id,
            name: d.renamedFileName || d.rawFileName,
            filePurged: Boolean(d.filePurged),
            hasFile: Boolean(d.driveFileId && isSiteStorageKey(d.driveFileId)),
          }))}
          hasRelazione={Boolean(
            current.relazioneStorageKey &&
              isSiteStorageKey(current.relazioneStorageKey),
          )}
        />
      ) : null}

      {sendLogs.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Audit invii segreteria
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {sendLogs.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-2 first:border-0 first:pt-0"
              >
                <span>
                  <span className="font-medium">{log.sentByName}</span>
                  {" · "}
                  {new Date(log.createdAt).toLocaleString("it-IT")}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  token …{log.packageToken.slice(-8)}
                  {log.packageExpiresAt
                    ? ` · scade ${new Date(log.packageExpiresAt).toLocaleDateString("it-IT")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-slate-400">
        Firma default: {settings?.brokerName ?? "Broker"}, auto-invio
        segreteria: {settings?.autoSendToSecretary ? "ON" : "OFF"}
      </p>
    </div>
  );
}
