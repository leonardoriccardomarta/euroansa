"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ExternalLink } from "lucide-react";
import {
  assignBrokerAction,
  updateApplicationStatusAction,
} from "@/actions/applications";
import type { ApplicationStatus } from "@/db/schema";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "DOCUMENTI_INCOMPLETI",
  "COMPLETA_DA_INOLTRARE",
  "INVIATA_A_SEGRETERIA",
  "INVIATA_IN_BANCA",
  "PERITO_NOMINATO",
  "DELIBERATA",
];

export function ApplicationCard({
  id,
  clientName,
  clientEmail,
  clientFiscalCode,
  status,
  statusLabel,
  statusClass,
  progressLabel,
  progressPct,
  sentLabel,
  driveFolderUrl,
  isTest,
  brokerId,
  brokers,
  canAssignBroker,
}: {
  id: string;
  clientName: string;
  clientEmail: string;
  clientFiscalCode: string | null;
  status: ApplicationStatus;
  statusLabel: string;
  statusClass: string;
  progressLabel: string;
  progressPct: number;
  sentLabel: string;
  driveFolderUrl: string | null;
  isTest?: boolean;
  brokerId: string | null;
  brokers: Array<{ id: string; name: string; email: string }>;
  canAssignBroker: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary-200 hover:shadow-md sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link
          href={`/dashboard/applications/${id}`}
          prefetch
          className="min-w-0 flex-1 block active:scale-[0.99]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {clientName}
            </h3>
            {isTest ? (
              <Badge
                variant="outline"
                className="border-violet-200 bg-violet-50 text-violet-700"
              >
                Test
              </Badge>
            ) : null}
            <Badge variant="outline" className={statusClass}>
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {clientEmail}
            {clientFiscalCode ? ` · ${clientFiscalCode}` : ""}
          </p>
          <div className="mt-3 max-w-xs">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Checklist</span>
              <span>{progressLabel}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-primary-600"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </Link>

        <div className="flex w-full flex-col gap-2 sm:w-[220px] sm:shrink-0">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              Stato
            </label>
            <select
              value={status}
              disabled={pending}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const next = e.target.value as ApplicationStatus;
                startTransition(async () => {
                  const res = await updateApplicationStatusAction(id, next);
                  if (res && "error" in res && res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Stato aggiornato");
                  router.refresh();
                });
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {APPLICATION_STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          {canAssignBroker ? (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Broker
              </label>
              <select
                value={brokerId ?? ""}
                disabled={pending}
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const next = e.target.value || null;
                  startTransition(async () => {
                    await assignBrokerAction(id, next);
                    toast.success(next ? "Broker assegnato" : "Broker rimosso");
                    router.refresh();
                  });
                }}
              >
                <option value="">Non assegnata</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
        <Link
          href={`/dashboard/applications/${id}`}
          prefetch
          className="min-h-10 inline-flex items-center font-semibold text-primary-600"
        >
          Apri pratica
        </Link>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{sentLabel}</span>
          {driveFolderUrl ? (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1 font-medium text-slate-600 hover:text-primary-600"
            >
              Drive <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
