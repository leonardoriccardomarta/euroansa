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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { status } = await searchParams;

  // Hub: mail ufficio (OAuth admin). Documenti su Cloudflare R2.
  // ADMIN = vede tutte + assegna.
  // BROKER = soci minori, solo pratiche assegnate a loro.
  const appWhere =
    session.role === "ADMIN"
      ? undefined
      : and(eq(applications.brokerId, session.id), eq(applications.isTest, false));

  const appsQuery = db
    .select({
      id: applications.id,
      clientName: applications.clientName,
      clientEmail: applications.clientEmail,
      clientFiscalCode: applications.clientFiscalCode,
      employmentType: applications.employmentType,
      status: applications.status,
      sentToSecretaryAt: applications.sentToSecretaryAt,
      isTest: applications.isTest,
      brokerId: applications.brokerId,
      requiredDocumentTypes: applications.requiredDocumentTypes,
      lastPipelineError: applications.lastPipelineError,
      updatedAt: applications.updatedAt,
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

  // Aperte sempre in alto; rogitate in fondo. Dentro ogni gruppo: più recenti prima.
  const filtered = (status ? apps.filter((a) => a.status === status) : apps)
    .slice()
    .sort((a, b) => {
      const aClosed = a.status === "ROGITATA" ? 1 : 0;
      const bClosed = b.status === "ROGITATA" ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  const total = apps.length;
  // Conteggio esatto per stato corrente (si aggiorna se torni indietro)
  const sentToSecretary = apps.filter(
    (a) => a.status === "INVIATA_A_SEGRETERIA",
  ).length;
  const rogitate = apps.filter((a) => a.status === "ROGITATA").length;

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
      .filter((a) => !a.isTest)
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
            ? "Vedi tutte le pratiche e assegna i broker."
            : "Le pratiche assegnate a te."}
        </p>
      </div>

      <PracticeAlertsPanel alerts={alerts} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Totale pratiche
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{total}</p>
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
            Rogitate
          </p>
          <p className="mt-2 text-3xl font-bold text-primary-600">{rogitate}</p>
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
