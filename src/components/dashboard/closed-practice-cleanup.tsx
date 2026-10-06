"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cleanupClosedPracticeAction } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

type CleanupDoc = {
  id: string;
  name: string;
  filePurged: boolean;
  hasFile: boolean;
};

export function ClosedPracticeCleanup({
  applicationId,
  documents: docs,
  hasRelazione,
  relazioneKept,
}: {
  applicationId: string;
  documents: CleanupDoc[];
  hasRelazione: boolean;
  relazioneKept?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const purgeable = useMemo(
    () => docs.filter((d) => d.hasFile && !d.filePurged),
    [docs],
  );
  const [keepIds, setKeepIds] = useState<Set<string>>(() => new Set());
  const [keepRelazione, setKeepRelazione] = useState(Boolean(relazioneKept));

  if (purgeable.length === 0 && !hasRelazione) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pulizia storage
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Nessun file da pulire: restano solo i metadati storici.
        </p>
      </section>
    );
  }

  function toggle(id: string) {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const willDelete = purgeable.filter((d) => !keepIds.has(d.id)).length;
  const willDeleteRelazione = hasRelazione && !keepRelazione;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pulizia file (pratica rogitata)
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Spunta i file da <span className="font-medium text-slate-900">tenere</span>{" "}
        nello storico. Gli altri file verranno eliminati; i dati estratti
        restano in anagrafica.
      </p>

      <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
        {purgeable.map((d) => (
          <li key={d.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <input
                type="checkbox"
                className="mt-1 cursor-pointer"
                checked={keepIds.has(d.id)}
                onChange={() => toggle(d.id)}
              />
              <span className="min-w-0 text-sm text-slate-800">
                <span className="font-medium">{d.name}</span>
              </span>
            </label>
          </li>
        ))}
        {hasRelazione ? (
          <li>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <input
                type="checkbox"
                className="mt-1 cursor-pointer"
                checked={keepRelazione}
                onChange={() => setKeepRelazione((v) => !v)}
              />
              <span className="text-sm font-medium text-slate-800">
                Relazione broker
              </span>
            </label>
          </li>
        ) : null}
        {docs
          .filter((d) => d.filePurged)
          .map((d) => (
            <li
              key={d.id}
              className="px-2 py-1 text-xs text-slate-500"
            >
              {d.name}   già rimosso da storage
            </li>
          ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        disabled={pending || (willDelete === 0 && !willDeleteRelazione)}
        className="mt-4 min-h-11 cursor-pointer rounded-lg border-amber-200 text-amber-900 hover:bg-amber-50"
        onClick={() => setConfirm(true)}
      >
        Elimina gli altri da storage
        {willDelete + (willDeleteRelazione ? 1 : 0) > 0
          ? ` (${willDelete + (willDeleteRelazione ? 1 : 0)})`
          : ""}
      </Button>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Pulire i file non tenuti?"
        description="I file non spuntati verranno eliminati. Restano i dati della pratica e i file che hai scelto di tenere."
        confirmLabel="Elimina gli altri"
        destructive
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const res = await cleanupClosedPracticeAction({
              applicationId,
              keepDocumentIds: [...keepIds],
              keepRelazione,
            });
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            setConfirm(false);
            toast.success(
              `Pulizia ok: rimossi ${res.purged ?? 0} file, tenuti ${res.kept ?? 0}`,
            );
            router.refresh();
          });
        }}
      />
    </section>
  );
}
