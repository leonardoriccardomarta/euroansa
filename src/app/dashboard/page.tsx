import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, documents, users } from "@/db/schema";
import { evaluateChecklist } from "@/lib/checklist";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { StatusFilter } from "@/components/dashboard/status-filter";
import { ApplicationCard } from "@/components/dashboard/application-card";

export const dynamic = "force-dynamic";

function statusBadgeClass(status: string) {
  if (status === "INVIATA_A_SEGRETERIA" || status === "DELIBERATA")
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "DOCUMENTI_INCOMPLETI")
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
  const session = await getSession();
  if (!session) redirect("/login");

  const { status } = await searchParams;

  const [appsRaw, docRows, brokerRows] = await Promise.all([
    db
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
      })
      .from(applications)
      .orderBy(desc(applications.updatedAt)),
    db
      .select({
        applicationId: documents.applicationId,
        documentType: documents.documentType,
        isValid: documents.isValid,
      })
      .from(documents),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users),
  ]);

  // Hub: mail ufficio (OAuth admin). Documenti su Blob.
  // ADMIN = vede tutte + assegna.
  // BROKER = soci minori, solo pratiche assegnate a loro.
  const apps =
    session.role === "ADMIN"
      ? appsRaw
      : appsRaw.filter((a) => !a.isTest && a.brokerId === session.id);

  const docsByApp = new Map<string, typeof docRows>();
  for (const d of docRows) {
    const list = docsByApp.get(d.applicationId) ?? [];
    list.push(d);
    docsByApp.set(d.applicationId, list);
  }

  const filtered = status ? apps.filter((a) => a.status === status) : apps;

  const total = apps.length;
  const sentToSecretary = apps.filter(
    (a) => a.status === "INVIATA_A_SEGRETERIA",
  ).length;
  const sent = apps.filter(
    (a) =>
      a.status === "INVIATA_A_SEGRETERIA" ||
      a.status === "INVIATA_IN_BANCA" ||
      a.status === "PERITO_NOMINATO" ||
      a.status === "DELIBERATA",
  ).length;

  const brokers = brokerRows
    .filter((b) => b.role === "BROKER")
    .map((b) => ({
      id: b.id,
      name: b.name,
      email: b.email,
    }));

  const isAdmin = session.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
          Pratiche
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          {isAdmin
            ? "Mail ufficio + storage sito. Vedi tutte le pratiche e assegna i broker."
            : "Le pratiche assegnate a te."}
        </p>
      </div>

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
            Inviate in banca
          </p>
          <p className="mt-2 text-3xl font-bold text-primary-600">{sent}</p>
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
