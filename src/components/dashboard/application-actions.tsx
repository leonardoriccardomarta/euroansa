"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  getSollecitoTextAction,
  sendToSecretaryAction,
  updateApplicationStatusAction,
} from "@/actions/applications";
import type { ApplicationStatus } from "@/db/schema";
import {
  APPLICATION_STATUS_LABELS,
  BANK_MANUAL_STATUSES,
} from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BANK_STATUS_OPTIONS: ApplicationStatus[] = [
  "INVIATA_A_SEGRETERIA",
  ...BANK_MANUAL_STATUSES,
];

export function ApplicationActions({
  applicationId,
  status,
}: {
  applicationId: string;
  status: ApplicationStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sollecito, setSollecito] = useState<string | null>(null);
  const [optStatus, setOptStatus] = useOptimistic(status);

  const canSendToSecretary =
    status === "DOCUMENTI_INCOMPLETI" || status === "COMPLETA_DA_INOLTRARE";
  const showBankStatus = [
    "INVIATA_A_SEGRETERIA",
    "INVIATA_IN_BANCA",
    "PERITO_NOMINATO",
    "DELIBERATA",
  ].includes(status);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {canSendToSecretary ? (
          <Button
            disabled={pending}
            className="min-h-11 flex-1 rounded-lg bg-primary-600 font-semibold shadow-md active:scale-95 hover:bg-primary-700 sm:flex-none"
            onClick={() => {
              startTransition(async () => {
                try {
                  await sendToSecretaryAction(applicationId);
                  toast.success("Inviata a segreteria");
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
      </div>

      {showBankStatus ? (
        <div className="w-full sm:w-[260px]">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Stato pratica (post-segreteria)
          </label>
          <select
            value={optStatus}
            disabled={pending}
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800"
            onChange={(e) => {
              const next = e.target.value as ApplicationStatus;
              startTransition(async () => {
                setOptStatus(next);
                await updateApplicationStatusAction(applicationId, next);
                toast.success("Stato aggiornato");
                router.refresh();
              });
            }}
          >
            {BANK_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {sollecito && (
        <pre className="mt-2 max-w-md whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {sollecito}
        </pre>
      )}
    </div>
  );
}
