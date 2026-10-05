"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadRelazioneAction } from "@/actions/applications";
import {
  generateRelazioneDraftAction,
  publishRelazionePdfAction,
  saveRelazioneDraftAction,
} from "@/actions/phase3";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RelazioneStudio({
  applicationId,
  hasRelazione,
  fileName,
  uploadedAt,
  initialDraft,
}: {
  applicationId: string;
  hasRelazione: boolean;
  fileName: string | null;
  uploadedAt: Date | string | null;
  initialDraft: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <div
      data-tour="tour-relazione"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Relazione broker</h3>
          <p className="mt-1 text-sm text-slate-600">
            Genera la bozza con l&apos;AI, correggi, poi pubblica il PDF.
            Oppure carica un PDF già pronto.
          </p>
          {hasRelazione ? (
            <p className="mt-2 text-sm text-emerald-700">
              PDF ufficiale:{" "}
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
                  {new Date(uploadedAt).toLocaleString("it-IT")}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-sm font-medium text-amber-700">
              Mancante: senza PDF relazione non si può inviare a segreteria.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="min-h-10"
            onClick={() => {
              startTransition(async () => {
                const res = await generateRelazioneDraftAction(applicationId);
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                if (res && "body" in res && res.body) setDraft(res.body);
                toast.success("Bozza generata — controlla e pubblica");
                router.refresh();
              });
            }}
          >
            {pending ? "..." : "Genera bozza AI"}
          </Button>
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
            variant="outline"
            disabled={pending}
            className="min-h-10"
            onClick={() => inputRef.current?.click()}
          >
            {hasRelazione ? "Sostituisci PDF" : "Carica PDF"}
          </Button>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={16}
        placeholder="Qui compare la bozza relazione (DATI PRATICA + bullet RELAZIONE TIPO)…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || !draft.trim()}
          className="min-h-10"
          onClick={() => {
            startTransition(async () => {
              const res = await saveRelazioneDraftAction(applicationId, draft);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Bozza salvata");
            });
          }}
        >
          Salva bozza
        </Button>
        <Button
          type="button"
          disabled={pending || !draft.trim()}
          className="min-h-10 bg-primary-600 font-semibold hover:bg-primary-700"
          onClick={() => {
            startTransition(async () => {
              await saveRelazioneDraftAction(applicationId, draft);
              const res = await publishRelazionePdfAction(applicationId);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("PDF relazione pubblicato");
              router.refresh();
            });
          }}
        >
          Pubblica PDF relazione
        </Button>
      </div>
    </div>
  );
}
