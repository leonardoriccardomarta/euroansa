import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ChevronLeft, Folder } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { DOCUMENT_TYPE_LABELS } from "@/lib/config/documents";
import { syncStorageFoldersForApp } from "@/actions/files";
import {
  CreateFolderForm,
  DeleteFolderButton,
  DocumentFileRow,
  FolderUploadButton,
} from "@/components/dashboard/file-browser-actions";
import { RelazioneFileActions } from "@/components/dashboard/relazione-file-actions";

export const dynamic = "force-dynamic";

export default async function ClientFilesPage({
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
  if (app.isTest && session.role !== "ADMIN") redirect("/dashboard/files");
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    redirect("/dashboard/files");
  }

  const folders = await syncStorageFoldersForApp(id);

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, id))
    .orderBy(desc(documents.createdAt));

  const fallbackFolder = folders[0] ?? "DOC";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/files"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Tutte le cartelle
        </Link>
        <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold text-slate-900">
          <Folder className="h-8 w-8 text-amber-600" />
          {app.clientName}
        </h1>
        <p className="mt-2 text-slate-600">
          {app.clientEmail}
          {" · "}
          <Link
            href={`/dashboard/applications/${app.id}`}
            className="font-medium text-primary-600 hover:underline"
          >
            Apri pratica
          </Link>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <CreateFolderForm applicationId={app.id} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <RelazioneFileActions
          applicationId={app.id}
          hasRelazione={Boolean(app.relazioneStorageKey)}
          fileName={app.relazioneFileName}
        />
      </div>

      <div className="space-y-4">
        {folders.map((label) => {
          const list = docs.filter((d) => {
            const key = d.storageSubfolder?.trim() || fallbackFolder;
            return key === label;
          });

          return (
            <section
              key={label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Folder className="h-5 w-5 text-amber-600" />
                  <div>
                    <h2 className="font-semibold text-slate-900">{label}</h2>
                    <p className="text-xs text-slate-500">{list.length} file</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FolderUploadButton
                    applicationId={app.id}
                    folderName={label}
                  />
                  <DeleteFolderButton
                    applicationId={app.id}
                    folderName={label}
                  />
                </div>
              </div>

              {list.length === 0 ? (
                <p className="text-sm text-slate-500">Cartella vuota.</p>
              ) : (
                <div>
                  {list.map((doc) => (
                    <DocumentFileRow
                      key={doc.id}
                      documentId={doc.id}
                      name={doc.renamedFileName}
                      downloadUrl={doc.driveFileUrl}
                      meta={`${DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}${
                        doc.isValid ? "" : " · da verificare"
                      }`}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
