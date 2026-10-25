import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, documents, users } from "@/db/schema";
import { evaluateChecklist } from "@/lib/checklist";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { buildPracticeAlerts } from "@/lib/practice-alerts";
import { StatusFilter } from "@/components/dashboard/status-filter";
import { ApplicationCard } from "@/components/dashboard/application-card";
import { PracticeAlertsPanel } from "@/components/dashboard/practice-alerts-panel";

export const dynamic = "force-dynamic";

function statusBadgeClass(status: string) {
  if (status === "INVIATA_A_SEGRETERIA" || status === "ROGITATA")
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "DOCUMENTI_INCOMPLETI")
    return "bg-red-100 text-red-800 border-red-200";
  if (status === "COMPLETA_DA_INOLTRARE")
    return "bg-primary-50 text-primary-700 border-primary-200";
  if (
    status === "DELIBERA_REDDITUALE" ||
    status === "PERIZIA_PRESA" ||
    status === "PERIZIA_EFFETTUATA" ||
    status === "DELIBERA_FINALE"
  )
    return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

const PIPELINE_PRIORITY: Record<string, number> = {
  DOCUMENTI_INCOMPLETI: 1,
  COMPLETA_DA_INOLTRARE: 2,
  INVIATA_A_SEGRETERIA: 3,
  DELIBERA_REDDITUALE: 4,
  PERIZIA_PRESA: 5,
  PERIZIA_EFFETTUATA: 6,
  DELIBERA_FINALE: 7,
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { status } = await searchParams;

  const appWhere =
    session.role === "ADMIN"
      ? undefined
      : and(
          eq(applications.brokerId, session.id),
          eq(applications.isTest, false),
        );

  const appsQuery = db
    .select({
      id: applications.id,
      clientName: applications.clientName,
      clientEmail: applications.clientEmail,
      clientFiscalCode: applications.clientFiscalCode,
      isCouple: applications.isCouple,
      applicantFiscalCodes: applications.applicantFiscalCodes,
      employmentType: applications.employmentType,
      status: applications.status,
      sentToSecretaryAt: applications.sentToSecretaryAt,
      isTest: applications.isTest,
      brokerId: applications.brokerId,
      requiredDocumentTypes: applications.requiredDocumentTypes,
      lastPipelineError: applications.lastPipelineError,
      updatedAt: applications.updatedAt,
      rogitoAt: applications.rogitoAt,
    })
    .from(applications)
    .$dynamic();

  const [apps, brokerRows] = await Promise.all([
    (appWhere ? appsQuery.where(appWhere) : appsQuery).orderBy(
      desc(applications.updatedAt),
    ),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users),
  ]);

  const appIds = apps.map((a) => a.id);
  const docRows =
    appIds.length === 0
      ? []
      : await db
          .select({
            applicationId: documents.applicationId,
            documentType: documents.documentType,
            isValid: documents.isValid,
            extractedData: documents.extractedData,
          })
          .from(documents)
          .where(inArray(documents.applicationId, appIds));

  const docsByApp = new Map<string, typeof docRows>();
  for (const d of docRows) {
    const list = docsByApp.get(d.applicationId) ?? [];
    list.push(d);
    docsByApp.set(d.applicationId, list);
  }

  let filtered: typeof apps = [];
  if (status === "ROGITATA") {
    filtered = apps
      .filter((a) => a.status === "ROGITATA")
      .slice()
      .sort((a, b) => {
        const timeA = a.rogitoAt
          ? new Date(a.rogitoAt).getTime()
          : a.updatedAt.getTime();
        const timeB = b.rogitoAt
          ? new Date(b.rogitoAt).getTime()
          : b.updatedAt.getTime();
        return timeB - timeA;
      });
  } else if (status) {
    filtered = apps
      .filter((a) => a.status === status)
      .slice()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } else {
    // "Tutti" tab: esclude categoricamente le pratiche ROGITATA
    // Ordine di pipeline: 1. Doc incompleti, 2. Completa da inoltrare, 3. Inviata segreteria,
    // 4. Delibera reddituale, 5. Perizia presa, 6. Perizia effettuata, 7. Delibera finale
    // Ordinamento secondario: updatedAt decrescente
    filtered = apps
      .filter((a) => a.status !== "ROGITATA")
      .slice()
      .sort((a, b) => {
        const prioA = PIPELINE_PRIORITY[a.status] ?? 99;
        const prioB = PIPELINE_PRIORITY[b.status] ?? 99;
        if (prioA !== prioB) {
          return prioA - prioB;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
  }

  // KPI Counters:
  // PRATICHE ATTIVE: conteggio totale pratiche non rogitate
  const totalActive = apps.filter((a) => a.status !== "ROGITATA").length;
  // INVIATE A SEGRETERIA: conteggio pratiche attualmente in stato INVIATA_A_SEGRETERIA
  const sentToSecretary = apps.filter(
    (a) => a.status === "INVIATA_A_SEGRETERIA",
  ).length;
  // IN LAVORAZIONE: conteggio strettamente delle pratiche preliminari prima dell'invio (DOCUMENTI_INCOMPLETI e COMPLETA_DA_INOLTRARE)
  const inProgress = apps.filter(
    (a) =>
      a.status === "DOCUMENTI_INCOMPLETI" ||
      a.status === "COMPLETA_DA_INOLTRARE",
  ).length;

  const brokers = brokerRows
    .filter((b) => b.role === "BROKER")
    .map((b) => ({
      id: b.id,
      name: b.name,
      email: b.email,
    }));

  const isAdmin = session.role === "ADMIN";

  const alerts = buildPracticeAlerts(
    apps
      .filter((a) => !a.isTest && a.status !== "ROGITATA")
      .map((a) => ({
        id: a.id,
        clientName: a.clientName,
        status: a.status,
        updatedAt: a.updatedAt,
        requiredDocumentTypes: a.requiredDocumentTypes,
        docs: docsByApp.get(a.id) ?? [],
        lastPipelineError: a.lastPipelineError,
      })),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
          Pratiche
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          {isAdmin
            ? "Vedi tutte le pratiche attive e assegna i broker."
            : "Le tue pratiche attive assegnate."}
        </p>
      </div>

      <PracticeAlertsPanel alerts={alerts} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pratiche attive
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalActive}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Inviate a segreteria
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            {sentToSecretary}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            In lavorazione
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {inProgress}
          </p>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:overflow-visible md:px-0">
        <StatusFilter current={status} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-slate-900">Elenco pratiche</h2>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-900">Nessuna pratica ancora</p>
            <p className="mt-2 text-sm text-slate-500">
              {isAdmin
                ? "Quando arrivano documenti sulla mail ufficio, assegna la pratica a un broker se serve."
                : "Quando l'admin ti assegna una pratica, compare qui."}
            </p>
          </div>
        ) : (
          filtered.map((app) => {
            const docs = docsByApp.get(app.id) ?? [];
            const checklist = evaluateChecklist(
              app.requiredDocumentTypes,
              docs,
            );
            const pct =
              checklist.totalRequired > 0
                ? (checklist.completedCount / checklist.totalRequired) * 100
                : 0;

            return (
              <ApplicationCard
                key={app.id}
                id={app.id}
                clientName={app.clientName}
                clientEmail={app.clientEmail}
                clientFiscalCode={app.clientFiscalCode}
                isCouple={app.isCouple}
                applicantFiscalCodes={app.applicantFiscalCodes}
                status={app.status}
                statusLabel={
                  APPLICATION_STATUS_LABELS[app.status] ?? app.status
                }
                statusClass={statusBadgeClass(app.status)}
                progressLabel={checklist.progressLabel}
                progressPct={pct}
                sentLabel={
                  app.sentToSecretaryAt
                    ? `Segreteria ${new Date(app.sentToSecretaryAt).toLocaleDateString("it-IT")}`
                    : "Non inviata"
                }
                isTest={app.isTest}
                hasPipelineError={Boolean(app.lastPipelineError)}
                brokerId={app.brokerId}
                brokers={brokers}
                canAssignBroker={isAdmin}
              />
            );
          })
        )}
      </section>
    </div>
  );
}
