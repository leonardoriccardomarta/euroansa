"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendToSecretaryAction } from "@/actions/applications";
import { buildSecretaryEmailDraft } from "@/lib/google/secretary-sender-draft";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type SecretarySendDocOption = {
  id: string;
  label: string;
  folder: string | null;
};

export function SecretarySendDialog({
  open,
  onOpenChange,
  applicationId,
  clientName,
  signature,
  docs,
  isResend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  clientName: string;
  signature: string;
  docs: SecretarySendDocOption[];
  isResend: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const draft = useMemo(
    () =>
      buildSecretaryEmailDraft({
        clientName,
        signature,
        packageUrl: "{{PACKAGE_URL}}",
      }),
    [clientName, signature],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(docs.map((d) => d.id)),
  );
  const [subject, setSubject] = useState(draft.subject);
  const [bodyText, setBodyText] = useState(draft.bodyText);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(new Set(docs.map((d) => d.id)));
    setSubject(draft.subject);
    setBodyText(draft.bodyText);
  }, [open, docs, draft.subject, draft.bodyText]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(on: boolean) {
    setSelected(on ? new Set(docs.map((d) => d.id)) : new Set());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-slate-100 px-5 py-4">
          <DialogTitle>
            {isResend ? "Reinvia a segreteria" : "Invia a segreteria"}
          </DialogTitle>
          <DialogDescription>
            Scegli i file del pacchetto e controlla la mail. La relazione viene
            sempre inclusa. Il link pacchetto si genera all&apos;invio.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                File ({selected.size}/{docs.length})
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-primary-700 hover:underline"
                  onClick={() => selectAll(true)}
                >
                  Tutti
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-slate-600 hover:underline"
                  onClick={() => selectAll(false)}
                >
                  Nessuno
                </button>
              </div>
            </div>
            {docs.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Nessun file valido sullo storage. Carica o classifica i documenti.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {docs.map((doc) => {
                  const on = selected.has(doc.id);
                  return (
                    <li key={doc.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-white">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-primary-600"
                          checked={on}
                          onChange={() => toggle(doc.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {doc.label}
                          </span>
                          {doc.folder ? (
                            <span className="block truncate text-[11px] text-slate-500">
                              {doc.folder}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              + Relazione (sempre) · eventuale preventivo se presente
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Anteprima mail
            </p>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Oggetto"
              className="rounded-lg"
            />
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={10}
              className="rounded-lg font-mono text-xs"
            />
            <p className="text-[11px] text-slate-500">
              Lascia <code className="rounded bg-slate-100 px-1">{"{{PACKAGE_URL}}"}</code>{" "}
              dove vuoi il link, oppure verrà aggiunto in fondo.
            </p>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none border-t border-slate-100 bg-white px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={pending || selected.size === 0}
            className="rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
            onClick={() => {
              const ids = [...selected];
              startTransition(async () => {
                const res = await sendToSecretaryAction(applicationId, {
                  documentIds: ids,
                  subject,
                  bodyText,
                });
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  router.refresh();
                  return;
                }
                if (res && "legacySkipped" in res && res.legacySkipped) {
                  toast.message(
                    `${res.legacySkipped} file Drive esclusi: ricaricali sullo storage sito`,
                  );
                }
                toast.success(
                  isResend
                    ? `Reinviata (${"documents" in res ? res.documents : ids.length} file)`
                    : `Inviata (${"documents" in res ? res.documents : ids.length} file)`,
                );
                onOpenChange(false);
                router.refresh();
              });
            }}
          >
            {pending ? "Invio..." : isResend ? "Reinvia ora" : "Invia ora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
