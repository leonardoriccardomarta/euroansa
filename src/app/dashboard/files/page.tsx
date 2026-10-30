import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Folder } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { CreateClientFolderForm } from "@/components/dashboard/file-browser-actions";
import { isTutorialPractice } from "@/lib/tutorial";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FilesIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { tab } = (await searchParams) ?? {};
  const currentTab = tab === "archiviate" ? "archiviate" : "tutte";

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
      isCouple: applications.isCouple,
      coApplicantName: applications.coApplicantName,
      coApplicantFiscalCode: applications.coApplicantFiscalCode,
      brokerId: applications.brokerId,
      isTest: applications.isTest,
      status: applications.status,
      updatedAt: applications.updatedAt,
      relazioneStorageKey: applications.relazioneStorageKey,
    })
    .from(applications)
    .$dynamic();

  const apps = await (appWhere ? appsQuery.where(appWhere) : appsQuery).orderBy(
    desc(applications.updatedAt),
  );

  const activeApps = apps.filter((a) => a.status !== "ROGITATA");
  const archivedApps = apps.filter((a) => a.status === "ROGITATA");

  const filtered = currentTab === "archiviate" ? archivedApps : activeApps;
  const appIds = filtered.map((a) => a.id);

  const counts =
    appIds.length === 0
      ? []
      : await db
          .select({
            applicationId: documents.applicationId,
            n: sql<number>`count(*)::int`,
          })
          .from(documents)
          .where(inArray(documents.applicationId, appIds))
          .groupBy(documents.applicationId);

  const countMap = new Map(counts.map((c) => [c.applicationId, c.n]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">File</h1>
        <p className="mt-2 text-slate-600">
          Crea cartelle, carica file, sostituisci o elimina i documenti delle
          pratiche.{" "}
          <span className="text-slate-500">
            Il flusso principale resta Pratiche (le mail creano tutto da sole):
            qui è l&apos;archivio e la creazione manuale.
          </span>
        </p>
      </div>

      <CreateClientFolderForm />

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <Link
          href="/dashboard/files"
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center rounded-lg px-4 text-sm font-medium transition-colors",
            currentTab === "tutte"
              ? "bg-primary-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          Tutte ({activeApps.length})
        </Link>
        <Link
          href="/dashboard/files?tab=archiviate"
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center rounded-lg px-4 text-sm font-medium transition-colors",
            currentTab === "archiviate"
              ? "bg-primary-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          Archiviate ({archivedApps.length})
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            {currentTab === "archiviate"
              ? "Nessuna cartella archiviata. Le cartelle delle pratiche completate (rogitate) compariranno qui."
              : "Nessuna cartella attiva. Creane una sopra, oppure arriva dalle email / pratiche."}
          </div>
        ) : (
          filtered.map((app) => {
            const n = countMap.get(app.id) ?? 0;
            const hasRelazione = Boolean(app.relazioneStorageKey);
            return (
              <Link
                key={app.id}
                href={`/dashboard/files/${app.id}`}
                prefetch
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md active:scale-[0.99]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <Folder className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-slate-900">
                      {app.isCouple && app.coApplicantName
                        ? `${app.clientName} & ${app.coApplicantName}`
                        : app.clientName}
                    </p>
                    {isTutorialPractice(app) ? (
                      <Badge
                        variant="outline"
                        className="border-sky-200 bg-sky-50 text-sky-800"
                      >
                        Guida
                      </Badge>
                    ) : null}
                    {app.isTest ? (
                      <Badge
                        variant="outline"
                        className="border-violet-200 bg-violet-50 text-violet-700"
                      >
                        Test
                      </Badge>
                    ) : null}
                  </div>
                  {app.clientFiscalCode || (app.isCouple && app.coApplicantFiscalCode) ? (
                    <p className="truncate text-xs text-slate-500">
                      {[
                        app.clientFiscalCode ? `CF ${app.clientFiscalCode}` : null,
                        app.isCouple && app.coApplicantFiscalCode
                          ? `CF2 ${app.coApplicantFiscalCode}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-600">
                    {n} file
                    {hasRelazione ? ", relazione ok" : ", senza relazione"}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
