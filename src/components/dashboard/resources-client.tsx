"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  reclassifyImportedDocsAction,
  syncClosedPracticesFromDriveAction,
} from "@/actions/drive-import";
import {
  deleteResourceAction,
  syncResourcesFromDriveAction,
  uploadResourceAction,
} from "@/actions/phase3";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "MODULISTICA", label: "Modulistica" },
  { value: "TEMPLATE", label: "Template" },
  { value: "POLICY", label: "Policy" },
  { value: "PORTALI", label: "Portali banche" },
  { value: "ALTRO", label: "Altro" },
] as const;

type Row = {
  id: string;
  title: string;
  category: string;
  fileName: string;
  createdAt: Date | string;
};

export function ResourcesClient({
  rows,
  isAdmin,
}: {
  rows: Row[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const byCat = CATEGORIES.map((c) => ({
    ...c,
    items: rows.filter((r) => r.category === c.value),
  })).filter((c) => c.items.length > 0 || isAdmin);

  return (
    <div className="space-y-8">
      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  "Scaricare da Drive i file ufficio (modulistica, template, policy) e caricarli in Risorse?",
                )
              ) {
                return;
              }
              startTransition(async () => {
                const res = await syncResourcesFromDriveAction();
                if (!res || !("ok" in res) || !res.ok) {
                  toast.error(
                    res && "error" in res && res.error
                      ? String(res.error)
                      : "Sync fallito",
                  );
                  return;
                }
                toast.success(
                  `Risorse: ${res.inserted} nuove, ${res.skipped} già presenti${
                    res.failed ? `, ${res.failed} errori` : ""
                  }`,
                );
                if (res.errors.length) {
                  toast.message(res.errors.slice(0, 3).join(" · "));
                }
                router.refresh();
              });
            }}
          >
            Sync risorse da Drive
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  "Importare pratiche concluse 2026 da Excel FILIPPO/MARCO su Drive (status ROGITATA, economia, broker)?",
                )
              ) {
                return;
              }
              startTransition(async () => {
                const res = await syncClosedPracticesFromDriveAction();
                if (!res || !("ok" in res) || !res.ok) {
                  toast.error(
                    res && "error" in res && res.error
                      ? String(res.error)
                      : "Import fallito",
                  );
                  return;
                }
                toast.success(
                  `Pratiche: ${res.created} create, ${res.updated} aggiornate · ${res.docsAttached ?? 0} file · ${res.junkRemoved ?? 0} spazzatura rimossa`,
                );
                if (res.errors?.length) {
                  toast.message(res.errors.slice(0, 3).join(" · "));
                }
                router.refresh();
              });
            }}
          >
            Sync pratiche chiuse 2026
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await reclassifyImportedDocsAction();
                if (!res || !("ok" in res) || !res.ok) {
                  toast.error("Riconoscimento tipi fallito");
                  return;
                }
                toast.success(
                  `Tipi riconosciuti: ${res.typesUpdated} · checklist aggiornate: ${res.checklistsUpdated}`,
                );
                router.refresh();
              });
            }}
          >
            Riconosci tipi da nomi file
          </Button>
        </div>
      ) : null}

      {isAdmin ? (
        <form
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await uploadResourceAction(fd);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Risorsa caricata");
              e.currentTarget.reset();
              router.refresh();
            });
          }}
        >
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Carica file agenzia
            </p>
          </div>
          <div className="space-y-1">
            <Label>Titolo</Label>
            <Input name="title" required className="h-10" />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <select
              name="category"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              defaultValue="TEMPLATE"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>File</Label>
            <Input name="file" type="file" required className="h-10" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button
              type="submit"
              disabled={pending}
              className="min-h-10 bg-primary-600 hover:bg-primary-700"
            >
              {pending ? "Caricamento..." : "Carica"}
            </Button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nessuna risorsa ancora. L&apos;admin carica modulistica, template e
          policy qui   niente più Drive.
        </div>
      ) : (
        byCat.map((cat) => (
          <section key={cat.value} className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">{cat.label}</h2>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
              {cat.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.fileName}</p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/api/resources/${item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-800 hover:bg-slate-200"
                    >
                      Apri
                    </a>
                    {isAdmin ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        className="min-h-9 text-red-700"
                        onClick={() => {
                          if (!confirm("Eliminare questa risorsa?")) return;
                          startTransition(async () => {
                            const res = await deleteResourceAction(item.id);
                            if (res && "error" in res && res.error) {
                              toast.error(res.error);
                              return;
                            }
                            toast.success("Eliminata");
                            router.refresh();
                          });
                        }}
                      >
                        Elimina
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
