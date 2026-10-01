"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  getSollecitoTextAction,
  sendToSecretaryAction,
  updateApplicationStatusAction,
  updateEmploymentTypeAction,
} from "@/actions/applications";
import type { ApplicationStatus, EmploymentType } from "@/db/schema";
import { BANK_MANUAL_STATUSES } from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: "DIPENDENTE_INDETERMINATO", label: "Dipendente indeterminato" },
  { value: "PARTITA_IVA", label: "Partita IVA" },
  { value: "PENSIONATO", label: "Pensionato" },
  { value: "ALTRO", label: "Altro" },
];

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "IN_ATTESA_DOCUMENTI", label: "In attesa documenti" },
  { value: "DOCUMENTI_INCOMPLETI", label: "Documenti incompleti" },
  { value: "COMPLETA_DA_INOLTRARE", label: "Completa da inoltrare" },
  { value: "INVIATA_A_SEGRETERIA", label: "Inviata a segreteria" },
  ...BANK_MANUAL_STATUSES.map((s) => ({
    value: s as ApplicationStatus,
    label:
      s === "INVIATA_IN_BANCA"
        ? "Inviata in banca"
        : s === "PERITO_NOMINATO"
          ? "Perito nominato"
          : "Deliberata",
  })),
];

export function ApplicationActions({
  applicationId,
  status,
  employmentType,
}: {
  applicationId: string;
  status: ApplicationStatus;
  employmentType: EmploymentType;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sollecito, setSollecito] = useState<string | null>(null);
  const [optStatus, setOptStatus] = useOptimistic(status);
  const [optEmployment, setOptEmployment] = useOptimistic(employmentType);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
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

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <select
          value={optEmployment}
          disabled={pending}
          className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 sm:w-[220px]"
          onChange={(e) => {
            const next = e.target.value as EmploymentType;
            startTransition(async () => {
              setOptEmployment(next);
              await updateEmploymentTypeAction(applicationId, next);
              toast.success("Profilo aggiornato");
              router.refresh();
            });
          }}
        >
          {EMPLOYMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={optStatus}
          disabled={pending}
          className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 sm:w-[220px]"
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
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {sollecito && (
        <pre className="mt-2 max-w-md whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {sollecito}
        </pre>
      )}
    </div>
  );
}
