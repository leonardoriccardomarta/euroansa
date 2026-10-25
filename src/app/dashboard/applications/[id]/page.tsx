import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import {
  CheckCircle2,
  Circle,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import {
  applications,
  bankPolicies,
  documents,
  secretarySendLogs,
  systemSettings,
  users,
} from "@/db/schema";
import { ensureBankPolicySeed } from "@/lib/banks/ensure-seed";
import {
  evaluateChecklist,
  inferEmploymentType,
} from "@/lib/checklist";
import { displayClientEmail } from "@/lib/client-email";
import { normalizePracticeDocFolders } from "@/lib/pipeline";
import {
  EMPLOYMENT_TYPE_LABELS,
  sheetRowsForRequired,
} from "@/lib/config/documents";
import { isClientChecklistFolder } from "@/lib/resources/client-doc-folders";
import { isSecretaryPackageDoc } from "@/lib/google/secretary-sender-draft";
import { isLegacyDriveKey, isSiteStorageKey } from "@/lib/storage/paths";
import { PACKAGE_LINK_TTL_DAYS } from "@/lib/db/setup-statements";
import { isTutorialPractice } from "@/lib/tutorial";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "@/components/dashboard/application-actions";
import { ClosedPracticeCleanup } from "@/components/dashboard/closed-practice-cleanup";
import { PracticeDocumentsSection } from "@/components/dashboard/practice-documents-section";
import { RelazioneUpload } from "@/components/dashboard/relazione-upload";
import { PreventivoForm } from "@/components/dashboard/preventivo-form";
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

  const current = app;

  // Una sola cartella DOC ufficiale (fonde INFOINZAGO/SHEHATA DOC sparsi)
  await normalizePracticeDocFolders(id);

  await ensureBankPolicySeed();

  const [docs, sendLogs, settingsRow, allUsers, bankRows] = await Promise.all([
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
    db
      .select({
        bankName: bankPolicies.bankName,
        summary: bankPolicies.summary,
        rows: bankPolicies.rows,
        detailText: bankPolicies.detailText,
      })
      .from(bankPolicies)
      .orderBy(asc(bankPolicies.sortOrder), asc(bankPolicies.bankName)),
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
    // eslint-disable-next-line react-hooks/purity
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
            {current.isCouple &&
            (current.applicantFiscalCodes?.length ?? 0) > 0
              ? `CF ${current.applicantFiscalCodes!.join(" · ")}`
              : current.clientFiscalCode
                ? `CF ${current.clientFiscalCode}`
                : "CF non ancora rilevato"}
            {displayClientEmail(current.clientEmail)
              ? ` · ${displayClientEmail(current.clientEmail)}`
              : ""}
            {brokerName ? ` · ${brokerName}` : ""}
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
            {current.isCouple ? (
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-800"
              >
                Coppia / cointestatari
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
            isTest={current.isTest}
            clientName={current.clientName}
            hasRelazione={Boolean(
              current.relazioneStorageKey &&
                isSiteStorageKey(current.relazioneStorageKey),
            )}
            hasPackageLink={Boolean(current.packageToken)}
            signature={
              brokerName?.trim() || settings?.brokerName?.trim() || "Broker"
            }
            sendDocs={docs
              .filter(isSecretaryPackageDoc)
              .map((d) => ({
                id: d.id,
                label: d.renamedFileName || d.rawFileName,
                folder: d.storageSubfolder,
              }))}
          />
        </div>
      </div>

      {current.lastPipelineError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Operazione fallita   riprova</p>
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
        <p className="mt-1 text-xs text-slate-500">
          Checklist = documenti in DOC e IMMOBILE. BANCA e EUROANSA sono solo
          firmati/operativo (niente classifica). Relazione a parte.
        </p>
        {(() => {
          const unknownClient = docs.filter(
            (d) =>
              d.documentType === "SCONOSCIUTO" &&
              isClientChecklistFolder(d.storageSubfolder, current.clientName),
          ).length;
          return unknownClient > 0 ? (
            <p className="mt-2 text-sm text-amber-800">
              {unknownClient} file in DOC/IMMOBILE ancora senza tipo: usa
              Risorse → Riconosci tipi da nomi file.
            </p>
          ) : null;
        })()}
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
                const presentCount = row.types.filter((t) =>
                  checklist.present.includes(t),
                ).length;
                const allPresent = presentCount === row.types.length;
                const allValid = row.types.every((t) =>
                  checklist.presentValid.includes(t),
                );
                const needsReview = row.types.some((t) =>
                  checklist.invalid.includes(t),
                );
                // Multi-slot: la voce si “segna” appena c’è almeno un pezzo (niente 1/3 qui)
                const categoryStarted = presentCount > 0;
                return (
                  <li
                    key={`${row.label}-${row.types.join("-")}`}
                    className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-medium uppercase text-slate-700 sm:text-[13px]"
                  >
                    {allValid ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-emerald-600"
                        aria-label="Presente e valido"
                      />
                    ) : categoryStarted || needsReview ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-primary-600"
                        aria-label={
                          allPresent
                            ? "Presente da rivedere"
                            : "Categoria presente (ancora pezzi mancanti sotto)"
                        }
                      />
                    ) : (
                      <Circle
                        className="h-4 w-4 shrink-0 text-slate-300"
                        aria-label="Mancante"
                      />
                    )}
                    <span
                      className={
                        allValid || categoryStarted
                          ? "text-slate-800"
                          : "text-slate-600"
                      }
                    >
                      {row.label}
                      {needsReview && allPresent ? " · da rivedere" : ""}
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

      <RelazioneUpload
        applicationId={current.id}
        hasRelazione={Boolean(
          current.relazioneStorageKey &&
            isSiteStorageKey(current.relazioneStorageKey),
        )}
        fileName={current.relazioneFileName}
        uploadedAt={current.relazioneUploadedAt}
      />

      <PreventivoForm
        applicationId={current.id}
        clientName={current.clientName}
        banks={bankRows}
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

      <PracticeDocumentsSection
        applicationId={current.id}
        clientName={current.clientName}
        docs={docs}
        requiredDocumentTypes={current.requiredDocumentTypes ?? []}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Economia e audit
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Provvigioni e spunte conformità   da compilare a mano (il sistema non
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
                  {log.selectedDocumentIds?.length
                    ? ` · ${log.selectedDocumentIds.length} file`
                    : ""}
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
