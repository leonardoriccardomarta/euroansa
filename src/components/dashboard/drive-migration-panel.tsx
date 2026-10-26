"use client";

import { useState, useTransition } from "react";
import { runDriveMigrationAction } from "@/actions/migrate-drive";
import type { MigrationExecutionResult } from "@/lib/drive-migration/engine";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FolderSync,
  Play,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function DriveMigrationPanel() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MigrationExecutionResult | null>(null);
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null);

  const handleRun = (dryRun: boolean) => {
    if (!dryRun) {
      const ok = confirm(
        "Avviare la migrazione LIVE su Cloudflare R2 e database Neon per le 16 pratiche target? I file verranno scaricati da Drive e memorizzati in R2.",
      );
      if (!ok) return;
    }

    startTransition(async () => {
      try {
        const res = await runDriveMigrationAction({ dryRun });
        setResult(res);

        if (!res.ok) {
          toast.error(res.error || "Errore durante la migrazione da Drive");
          return;
        }

        if (dryRun) {
          toast.success(
            `Simulazione completata: ${res.matchedPractices}/${res.totalPractices} pratiche trovate (${res.filesDiscovered} file)`,
          );
        } else {
          toast.success(
            `Migrazione LIVE completata! ${res.filesImported} file importati su R2, ${res.filesSkipped} già presenti.`,
          );
        }
      } catch (err) {
        toast.error((err as Error).message || "Errore imprevisto");
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FolderSync className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Migrazione Pratiche Drive (15 Target)
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Importazione diretta a costo zero (ZERO AI, nessun OCR) dalle cartelle
            Google Drive di Marco Gorla (3 pratiche) e Filippo Carriero (12 pratiche)
            verso Cloudflare R2 e database Neon.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-10 text-xs font-semibold"
            onClick={() => handleRun(true)}
          >
            <Search className="mr-1.5 h-4 w-4" />
            {pending ? "Analisi in corso..." : "Verifica (Dry-Run)"}
          </Button>

          <Button
            type="button"
            disabled={pending}
            className="h-10 bg-primary-600 text-xs font-semibold text-white shadow hover:bg-primary-700"
            onClick={() => handleRun(false)}
          >
            <Play className="mr-1.5 h-4 w-4" />
            {pending ? "Migrazione in corso..." : "Avvia Migrazione Live"}
          </Button>
        </div>
      </div>

      {pending ? (
        <div className="mt-6 flex items-center justify-center rounded-lg border border-primary-100 bg-primary-50/50 p-6 text-sm text-primary-800">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <span>
              Scansione Google Drive in corso con matching fuzzy e classificazione
              deterministica...
            </span>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
              <span className="flex items-center gap-1.5 text-slate-900">
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                Modalità:{" "}
                <span className="uppercase text-primary-700">
                  {result.dryRun ? "Dry-Run (Simulazione)" : "LIVE (Scrittura R2 + DB)"}
                </span>
              </span>
              <span className="text-slate-600">
                Pratiche con match:{" "}
                <strong className="text-slate-900">
                  {result.matchedPractices} / {result.totalPractices}
                </strong>
              </span>
              <span className="text-slate-600">
                Documenti rilevati:{" "}
                <strong className="text-slate-900">
                  {result.filesDiscovered}
                </strong>
              </span>
              {!result.dryRun ? (
                <>
                  <span className="text-emerald-700">
                    Caricati su R2:{" "}
                    <strong>{result.filesImported}</strong>
                  </span>
                  <span className="text-slate-500">
                    Già presenti: <strong>{result.filesSkipped}</strong>
                  </span>
                </>
              ) : null}
            </div>

            {result.error ? (
              <p className="mt-2 text-xs font-semibold text-red-700">
                {result.error}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            {result.details.map((item) => {
              const isExpanded = expandedTarget === item.target;
              const hasMatch = !!item.matchedFolder;

              return (
                <div
                  key={item.target}
                  className={`rounded-lg border text-xs transition ${
                    hasMatch
                      ? "border-slate-200 bg-white"
                      : "border-amber-200 bg-amber-50/50"
                  }`}
                >
                  <div
                    className="flex cursor-pointer items-center justify-between p-3"
                    onClick={() =>
                      setExpandedTarget(isExpanded ? null : item.target)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <FileText
                        className={`h-4 w-4 ${
                          hasMatch ? "text-primary-600" : "text-amber-600"
                        }`}
                      />
                      <div>
                        <span className="font-semibold text-slate-900">
                          {item.target}
                        </span>
                        {item.driveFolderName && item.driveFolderName !== item.target ? (
                          <span className="ml-1.5 text-[11px] text-slate-500 font-normal">
                            [Drive: {item.driveFolderName}]
                          </span>
                        ) : null}
                        <span className="ml-2 text-slate-400">
                          ({item.broker})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {hasMatch ? (
                        <>
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Match: {item.score}%
                          </span>
                          <span className="text-slate-600">
                            {item.filesCount} file
                          </span>
                        </>
                      ) : (
                        <span className="text-amber-700">
                          Nessuna cartella trovata
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && hasMatch ? (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-3">
                      <p className="text-[11px] text-slate-600">
                        <strong>Cartella Drive:</strong> {item.matchedFolder}{" "}
                        <span className="text-slate-400">({item.driveFolderId})</span>
                      </p>
                      <p className="text-[11px] text-slate-600">
                        <strong>Motivo:</strong> {item.reason}
                      </p>

                      <div className="mt-3 space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-700">
                          Documenti classificati:
                        </p>
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-slate-200 bg-white p-2">
                          {item.files.map((f, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 border-b border-slate-50 py-1 text-[11px] last:border-0"
                            >
                              <span className="truncate text-slate-800" title={f.name}>
                                {f.name}
                              </span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                  {f.category}
                                </span>
                                <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-700">
                                  {f.type}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {f.subfolder}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
