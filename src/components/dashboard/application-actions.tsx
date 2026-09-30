"use client";

import { useState, useTransition } from "react";
import {
  getSollecitoTextAction,
  sendToSecretaryAction,
  updateApplicationStatusAction,
  updateEmploymentTypeAction,
} from "@/actions/applications";
import type { ApplicationStatus, EmploymentType } from "@/db/schema";
import { BANK_MANUAL_STATUSES } from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: "DIPENDENTE_INDETERMINATO", label: "Dipendente indeterminato" },
  { value: "PARTITA_IVA", label: "Partita IVA" },
  { value: "PENSIONATO", label: "Pensionato" },
  { value: "ALTRO", label: "Altro" },
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
  const [pending, startTransition] = useTransition();
  const [sollecito, setSollecito] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          className="bg-emerald-800 hover:bg-emerald-900"
          onClick={() => {
            startTransition(async () => {
              try {
                await sendToSecretaryAction(applicationId);
                toast.success("Inviata a segreteria");
              } catch {
                toast.error("Invio fallito — verifica Google OAuth");
              }
            });
          }}
        >
          Invia ora a segreteria
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const res = await getSollecitoTextAction(applicationId);
              if ("text" in res && res.text) {
                setSollecito(res.text);
                await navigator.clipboard.writeText(res.text);
                toast.success("Sollecito copiato negli appunti");
              }
            });
          }}
        >
          Copia sollecito cliente
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={employmentType}
          onValueChange={(v) => {
            if (!v) return;
            startTransition(async () => {
              await updateEmploymentTypeAction(
                applicationId,
                v as EmploymentType,
              );
              toast.success("Profilo aggiornato");
            });
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Profilo lavorativo" />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYMENT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => {
            if (!v) return;
            startTransition(async () => {
              await updateApplicationStatusAction(
                applicationId,
                v as ApplicationStatus,
              );
              toast.success("Stato aggiornato");
            });
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Stato pratica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="IN_ATTESA_DOCUMENTI">In attesa documenti</SelectItem>
            <SelectItem value="DOCUMENTI_INCOMPLETI">Documenti incompleti</SelectItem>
            <SelectItem value="COMPLETA_DA_INOLTRARE">Completa da inoltrare</SelectItem>
            <SelectItem value="INVIATA_A_SEGRETERIA">Inviata a segreteria</SelectItem>
            <SelectItem value="ANOMALIA">Anomalia</SelectItem>
            {BANK_MANUAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "INVIATA_IN_BANCA"
                  ? "Inviata in banca"
                  : s === "PERITO_NOMINATO"
                    ? "Perito nominato"
                    : "Deliberata"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sollecito && (
        <pre className="mt-2 max-w-md whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
          {sollecito}
        </pre>
      )}
    </div>
  );
}
