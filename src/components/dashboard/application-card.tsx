"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ApplicationCard({
  id,
  clientName,
  clientEmail,
  clientFiscalCode,
  statusLabel,
  statusClass,
  progressLabel,
  progressPct,
  sentLabel,
  driveFolderUrl,
  isTest,
}: {
  id: string;
  clientName: string;
  clientEmail: string;
  clientFiscalCode: string | null;
  statusLabel: string;
  statusClass: string;
  progressLabel: string;
  progressPct: number;
  sentLabel: string;
  driveFolderUrl: string | null;
  isTest?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary-200 hover:shadow-md active:scale-[0.99] sm:p-5">
      <Link href={`/dashboard/applications/${id}`} prefetch className="block">
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
