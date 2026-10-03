import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { Folder } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { CreateClientFolderForm } from "@/components/dashboard/file-browser-actions";

export const dynamic = "force-dynamic";

export default async function FilesIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const apps = await db
    .select({
      id: applications.id,
      clientName: applications.clientName,
      clientEmail: applications.clientEmail,
      brokerId: applications.brokerId,
      isTest: applications.isTest,
      updatedAt: applications.updatedAt,
      relazioneStorageKey: applications.relazioneStorageKey,
    })
    .from(applications)
    .orderBy(desc(applications.updatedAt));

  const filtered = apps.filter((app) => {
    if (app.isTest && session.role !== "ADMIN") return false;
    if (session.role !== "ADMIN" && app.brokerId !== session.id) return false;
    return true;
  });

  const counts = await db
    .select({
      applicationId: documents.applicationId,
      n: sql<number>`count(*)::int`,
    })
    .from(documents)
    .groupBy(documents.applicationId);

  const countMap = new Map(counts.map((c) => [c.applicationId, c.n]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">File</h1>
        <p className="mt-2 text-slate-600">
          Storage documenti: crea cartelle, carica file, sostituisci o elimina —
          come un drive interno.
        </p>
      </div>

      <CreateClientFolderForm />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Nessuna cartella. Creane una sopra, oppure arriva dalle email /
            pratiche.
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
                  <p className="truncate font-semibold text-slate-900">
                    {app.clientName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {app.clientEmail}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    {n} file
                    {hasRelazione ? " · relazione ok" : " · senza relazione"}
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
