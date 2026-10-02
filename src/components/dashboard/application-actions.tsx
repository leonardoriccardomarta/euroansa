"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteApplicationAction,
  getSollecitoTextAction,
  sendToSecretaryAction,
} from "@/actions/applications";
import type { ApplicationStatus } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ApplicationActions({
  applicationId,
  status,
  isAdmin = false,
  clientName,
  hasRelazione = false,
}: {
  applicationId: string;
  status: ApplicationStatus;
  isAdmin?: boolean;
  clientName?: string;
  hasRelazione?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sollecito, setSollecito] = useState<string | null>(null);

  const canSendToSecretary =
    status === "DOCUMENTI_INCOMPLETI" || status === "COMPLETA_DA_INOLTRARE";

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {canSendToSecretary ? (
          <Button
            disabled={pending || !hasRelazione}
            title={
              !hasRelazione
                ? "Carica prima la relazione PDF"
                : "Invia link pacchetto a segreteria"
            }
            className="min-h-11 flex-1 rounded-lg bg-primary-600 font-semibold shadow-md active:scale-95 hover:bg-primary-700 disabled:opacity-50 sm:flex-none"
            onClick={() => {
              startTransition(async () => {
                try {
                  const res = await sendToSecretaryAction(applicationId);
                  if (res && "error" in res && res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Inviata a segreteria (link pacchetto)");
                  router.refresh();
                } catch {
                  toast.error("Invio fallito. Verifica Google OAuth");
                }
              });
            }}
          >
            {pending ? "Invio..." : "Invia ora a segreteria"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={pending}
          className="min-h-11 flex-1 rounded-lg active:scale-95 sm:flex-none"
          onClick={() => {
            startTransition(async () => {
              const res = await getSollecitoTextAction(applicationId);
              if ("text" in res && res.text) {
                setSollecito(res.text);
                await navigator.clipboard.writeText(res.text);
                toast.success("Sollecito copiato");
              }
            });
          }}
        >
          Copia sollecito
        </Button>
        {isAdmin ? (
          <Button
            variant="outline"
            disabled={pending}
            className="min-h-11 flex-1 rounded-lg border-red-200 text-red-700 hover:bg-red-50 active:scale-95 sm:flex-none"
            onClick={() => {
              const label = clientName ? `"${clientName}"` : "questa pratica";
              if (
                !window.confirm(
                  `Eliminare ${label}? Documenti e file nello storage del sito verranno rimossi.`,
                )
              ) {
                return;
              }
              startTransition(async () => {
                try {
                  const res = await deleteApplicationAction(applicationId);
                  if (res && "error" in res && res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Pratica eliminata");
                  router.push("/dashboard");
                  router.refresh();
                } catch {
                  toast.error("Eliminazione fallita");
                }
              });
            }}
          >
            Elimina pratica
          </Button>
        ) : null}
      </div>

      {canSendToSecretary && !hasRelazione ? (
        <p className="text-xs text-amber-700">
          Carica la relazione per abilitare l&apos;invio.
        </p>
      ) : null}

      {sollecito && (
        <pre className="mt-2 max-w-md whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {sollecito}
        </pre>
      )}
    </div>
  );
}
