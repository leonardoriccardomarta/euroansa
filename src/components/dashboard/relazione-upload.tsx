"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadRelazioneAction } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RelazioneUpload({
  applicationId,
  hasRelazione,
  fileName,
  uploadedAt,
}: {
  applicationId: string;
  hasRelazione: boolean;
  fileName: string | null;
  uploadedAt: Date | string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [localName, setLocalName] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Relazione broker</h3>
          <p className="mt-1 text-sm text-slate-600">
            Obbligatoria prima dell&apos;invio a segreteria (PDF della pratica).
          </p>
          {hasRelazione ? (
            <p className="mt-2 text-sm text-emerald-700">
              Caricata:{" "}
              <a
                href={`/api/applications/${applicationId}/relazione`}
                className="font-medium underline"
                target="_blank"
                rel="noreferrer"
              >
                {fileName ?? "relazione.pdf"}
              </a>
              {uploadedAt ? (
                <span className="text-slate-500">
                  {" "}
                  · {new Date(uploadedAt).toLocaleString("it-IT")}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-sm font-medium text-amber-700">
              Mancante — senza relazione non si può inviare.
            </p>
          )}
          {localName ? (
            <p className="mt-1 text-xs text-slate-500">Selezionato: {localName}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setLocalName(f?.name ?? null);
              if (!f) return;
              const fd = new FormData();
              fd.set("relazione", f);
              startTransition(async () => {
                const res = await uploadRelazioneAction(applicationId, fd);
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Relazione caricata");
                router.refresh();
              });
            }}
          />
          <Button
            type="button"
            disabled={pending}
            className="min-h-11 rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
            onClick={() => inputRef.current?.click()}
          >
            {pending
              ? "Caricamento..."
              : hasRelazione
                ? "Sostituisci relazione"
                : "Carica relazione"}
          </Button>
        </div>
      </div>
    </div>
  );
}
