import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getPackageBundle } from "@/lib/package-bundle";
import { PACKAGE_LINK_TTL_DAYS } from "@/lib/db/setup-statements";
import { APP_NAME } from "@/lib/brand";
import { PackageFileList } from "@/components/dashboard/package-file-list";

export const dynamic = "force-dynamic";

export default async function PackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = t?.trim();
  if (!token) notFound();

  const bundle = await getPackageBundle(id, token);
  if (bundle.status === "invalid") notFound();

  if (bundle.status === "expired") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white px-4 py-12">
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {APP_NAME}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {bundle.app.clientName}
          </h1>
          <p className="mt-4 text-sm text-amber-800">
            Questo link è scaduto (validità {PACKAGE_LINK_TTL_DAYS} giorni).
            Chiedi al broker di rigenerare il pacchetto dalla pratica.
          </p>
        </div>
      </div>
    );
  }

  const { app, files, legacyCount } = bundle;
  const downloadUrl = `/api/packages/${id}?t=${encodeURIComponent(token)}`;
  const expiresLabel = app.packageTokenExpiresAt
    ? new Date(app.packageTokenExpiresAt).toLocaleDateString("it-IT")
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white px-4 py-12">
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-200/60">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 px-8 py-8 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            {APP_NAME}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {app.clientName}
          </h1>
          <p className="mt-2 text-sm text-white/85">
            {files.length} file pronti
            {expiresLabel ? ` · valido fino al ${expiresLabel}` : ""}
          </p>
        </div>

        <div className="px-8 py-6">
          {legacyCount > 0 ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {legacyCount} file vecchi non sono nello storage sito e non sono
              inclusi. Il broker deve ricaricarli.
            </p>
          ) : null}

          {files.length === 0 ? (
            <p className="text-sm text-amber-700">
              Nessun file disponibile sullo storage sito. Chiedi al broker di
              ricaricare i documenti.
            </p>
          ) : (
            <>
              <PackageFileList
                applicationId={id}
                token={token}
                files={files.map((f) => ({
                  name: f.name,
                  storageKey: f.storageKey,
                }))}
              />

              <a
                href={downloadUrl}
                className="mt-6 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.99]"
              >
                <Download className="h-4 w-4" />
                Scarica tutti ({files.length})
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
