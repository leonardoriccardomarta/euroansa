import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getPackageBundle } from "@/lib/package-bundle";

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
  if (!bundle) notFound();

  const { app, files } = bundle;
  const downloadUrl = `/api/packages/${id}?t=${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Euroansa
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {app.clientName}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Documenti pronti per il download.
        </p>

        {files.length === 0 ? (
          <p className="mt-8 text-sm text-amber-700">
            Nessun file disponibile al momento.
          </p>
        ) : (
          <>
            <ul className="mt-8 max-h-72 space-y-2 overflow-y-auto border-t border-slate-100 pt-4">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="truncate text-sm text-slate-700"
                  title={f.name}
                >
                  {f.name}
                </li>
              ))}
            </ul>

            <a
              href={downloadUrl}
              className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              <Download className="h-4 w-4" />
              Scarica tutti ({files.length})
            </a>
          </>
        )}
      </div>
    </div>
  );
}
