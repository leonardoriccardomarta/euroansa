"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRelazioneAction,
  uploadRelazioneFromFilesAction,
} from "@/actions/files";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RelazioneFileActions({
  applicationId,
  hasRelazione,
  fileName,
}: {
  applicationId: string;
  hasRelazione: boolean;
  fileName: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Relazione</p>
        {hasRelazione ? (
          <p className="mt-1 text-sm text-emerald-700">
            <a
              href={`/api/applications/${applicationId}/relazione`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {fileName ?? "relazione.pdf"}
            </a>
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-700">Mancante</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("relazione", f);
            startTransition(async () => {
              const res = await uploadRelazioneFromFilesAction(
                applicationId,
                fd,
              );
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Relazione aggiornata");
              router.refresh();
            });
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          disabled={pending}
          className="min-h-10 rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
          onClick={() => inputRef.current?.click()}
        >
          {pending
            ? "..."
            : hasRelazione
              ? "Sostituisci"
              : "Carica relazione"}
        </Button>
        {hasRelazione ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="min-h-10 rounded-lg border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => {
              if (!window.confirm("Eliminare la relazione?")) return;
              startTransition(async () => {
                const res = await deleteRelazioneAction(applicationId);
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Relazione eliminata");
                router.refresh();
              });
            }}
          >
            Elimina
          </Button>
        ) : null}
      </div>
    </div>
  );
}
