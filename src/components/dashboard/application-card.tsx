"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  assignBrokerAction,
  updateApplicationStatusAction,
} from "@/actions/applications";
import type { ApplicationStatus } from "@/db/schema";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { displayClientEmail } from "@/lib/client-email";
import { isTutorialPractice } from "@/lib/tutorial";
import { Compass, Pause } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "IN_ATTESA_RISCONTRO_CLIENTE",
  "DOCUMENTI_INCOMPLETI",
  "COMPLETA_DA_INOLTRARE",
  "INVIATA_IN_BANCA",
  "DELIBERATA",
  "PERIZIA_INCARICATA",
  "PERIZIA_EFFETTUATA",
  "DELIBERA_FINALE",
  "PREPARAZIONE_ATTO",
  "ROGITATA",
];

export function ApplicationCard({
  id,
  clientName,
  clientEmail,
  clientFiscalCode,
  isCouple,
  coApplicantName,
  coApplicantFiscalCode,
  applicantFiscalCodes,
  provenance,
  status,
  statusLabel,
  statusClass,
  progressLabel,
  progressPct,
  coupleProgress,
  sentLabel,
  isTest,
  brokerId,
  brokers,
  canAssignBroker,
}: {
  id: string;
  clientName: string;
  clientEmail: string;
  clientFiscalCode: string | null;
  isCouple?: boolean;
  coApplicantName?: string | null;
  coApplicantFiscalCode?: string | null;
  applicantFiscalCodes?: string[];
  provenance?: string | null;
  status: ApplicationStatus;
  statusLabel: string;
  statusClass: string;
  progressLabel: string;
  progressPct: number;
  coupleProgress?: {
    app1Label: string;
    app1Pct: number;
    app1Name: string;
    app2Label: string;
    app2Pct: number;
    app2Name: string;
  };
  sentLabel: string;
  isTest?: boolean;
  hasPipelineError?: boolean;
  brokerId: string | null;
  brokers: Array<{ id: string; name: string; email: string }>;
  canAssignBroker: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isGuida = isTutorialPractice({ clientName, clientEmail });

  const isFrozen = status === "IN_ATTESA_RISCONTRO_CLIENTE";
  const displayTitle =
    isCouple && coApplicantName
      ? `${clientName} & ${coApplicantName}`
      : clientName;

  const cf1 = clientFiscalCode?.trim().toUpperCase();
  const cf2 =
    coApplicantFiscalCode?.trim().toUpperCase() ||
    (applicantFiscalCodes?.[1] && applicantFiscalCodes[1] !== cf1
      ? applicantFiscalCodes[1].trim().toUpperCase()
      : undefined);

  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-sm transition hover:shadow-md sm:p-5",
        isFrozen
          ? "border-slate-300 bg-slate-50/70 opacity-75 hover:border-slate-400"
          : "border-slate-200 bg-white hover:border-primary-200",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link
          href={`/dashboard/applications/${id}`}
          prefetch
          className="min-w-0 flex-1 block active:scale-[0.99]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {displayTitle}
            </h3>
            {isGuida ? (
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-800"
              >
                Guida
              </Badge>
            ) : null}
            {isTest ? (
              <Badge
                variant="outline"
                className="border-violet-200 bg-violet-50 text-violet-700"
              >
                Test
              </Badge>
            ) : null}
            {isCouple ? (
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-800"
              >
                Coppia
              </Badge>
            ) : null}
            {provenance && provenance.trim() ? (
              <Badge
                variant="outline"
                className="border-slate-200/90 bg-slate-100/70 text-slate-700 inline-flex items-center gap-1 font-medium text-xs shadow-none backdrop-blur-xs"
                title={`Provenienza: ${provenance.trim()}`}
              >
                <Compass className="h-3 w-3 text-slate-500" />
                <span>{provenance.trim()}</span>
              </Badge>
            ) : null}
            <Badge variant="outline" className={statusClass}>
              {isFrozen ? <Pause className="mr-1 inline-block h-3 w-3" /> : null}
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {isCouple ? (
              cf1 && cf2 && cf1 !== cf2 ? (
                `CF ${cf1} · CF ${cf2}`
              ) : cf1 ? (
                `CF ${cf1}`
              ) : cf2 ? (
                `CF ${cf2}`
              ) : (
                "CF non ancora rilevato"
              )
            ) : cf1 ? (
              `CF ${cf1}`
            ) : (
              "CF non ancora rilevato"
            )}
            {displayClientEmail(clientEmail)
              ? ` · ${displayClientEmail(clientEmail)}`
              : ""}
          </p>

          {coupleProgress && isCouple ? (
            <div className="mt-3 space-y-2 max-w-sm">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span
                    className="font-semibold text-slate-700 truncate max-w-[130px]"
                    title={coupleProgress.app1Name}
                  >
                    {coupleProgress.app1Name}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {coupleProgress.app1Label}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-primary-600 transition-all"
                    style={{ width: `${coupleProgress.app1Pct}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span
                    className="font-semibold text-slate-700 truncate max-w-[130px]"
                    title={coupleProgress.app2Name}
                  >
                    {coupleProgress.app2Name}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {coupleProgress.app2Label}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-sky-600 transition-all"
                    style={{ width: `${coupleProgress.app2Pct}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 max-w-xs">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Checklist</span>
                <span>{progressLabel}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-primary-600 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
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
            <div data-tour="tour-broker-assign">
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
          <Link
            href={`/dashboard/files/${id}`}
            prefetch
            className="inline-flex min-h-10 items-center gap-1 font-medium text-slate-600 hover:text-primary-600"
          >
            File
          </Link>
        </div>
      </div>
    </div>
  );
}
