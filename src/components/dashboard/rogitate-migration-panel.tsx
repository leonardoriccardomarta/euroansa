"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Play,
  TrendingUp,
} from "lucide-react";
import { migrateRogitate2026Action } from "@/actions/migrate-rogitate-2026";
import type { MigrationRogitate2026Result } from "@/lib/resources/migrate-rogitate-2026";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GOOGLE_SHEET_2026_URL } from "@/lib/resources/rogitate-2026-data";

export function RogitateMigrationPanel() {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<MigrationRogitate2026Result | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleStart = () => {
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        const res = await migrateRogitate2026Action();
        setResult(res);

        if (!res.ok) {
          toast.error(res.error || "Errore durante la migrazione delle pratiche");
          return;
        }

        const msg =
          res.imported > 0
            ? `Migrazione completata con successo! ${res.imported} pratiche importate (${res.updated} aggiornate).`
            : `Sincronizzazione completata: tutte le ${res.total} pratiche risultano aggiornate.`;

        toast.success(msg);
      } catch (err) {
        toast.error((err as Error).message || "Errore imprevisto di rete");
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 ring-1 ring-emerald-200">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Migrazione Dati Storici (Rogitate 2026)
              </h2>
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800"
              >
                Broker Filippo
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Importa e sincronizza le 25 pratiche concluse nel 2026 dal Google
              Sheet ufficiale. Assegna lo stato <strong>ROGITATA</strong>, data
              rogito effettiva, parametri economici completi (mutuo erogato,
              provvigioni banca/polizza/cliente, quota broker) e contrassegna
              l&apos;audit economico come verificato.
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
              <a
                href={GOOGLE_SHEET_2026_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Google Sheet 2026</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <span>·</span>
              <span>Zero file R2 richiesti</span>
              <span>·</span>
              <span>Skippate da OCR/cron email</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">
          <Button
            type="button"
            disabled={pending}
            onClick={handleStart}
            className="h-10 bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Migrazione in corso...</span>
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4 fill-white" />
                <span>Esegui Migrazione Rogitate 2026</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Conferma migrazione Rogitate 2026"
        description="Sei sicuro di voler avviare la migrazione delle 25 pratiche concluse nel 2026 per il broker Filippo Carriero? I record verranno creati o aggiornati nello stato ROGITATA con audit economico convalidato."
        confirmLabel="Avvia Migrazione"
        cancelLabel="Annulla"
        onConfirm={handleConfirm}
      />

      {pending ? (
        <div className="mt-6 flex items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50/50 p-6 text-sm text-emerald-900">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <div>
              <p className="font-semibold">
                Importazione pratiche concluse in corso...
              </p>
              <p className="text-xs text-emerald-700">
                Lettura foglio PRATICHE CONCLUSE, verifica duplicati e
                salvataggio quote economiche.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-bold text-slate-900">
                Risultato Migrazione (Broker: {result.brokerName})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-slate-300 bg-white text-xs text-slate-700"
              >
                Fonte:{" "}
                {result.source === "live_sheet"
                  ? "Google Sheet Live"
                  : "Dataset 2026 Verificato"}
              </Badge>
              <Link
                href="/dashboard/rogitate"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
              >
                <span>Vedi in Rogitate</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <p className="text-xs text-slate-500">Totale Analizzate</p>
              <p className="text-lg font-bold text-slate-900">{result.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-center">
              <p className="text-xs text-emerald-700 font-medium">Nuove Inserite</p>
              <p className="text-lg font-bold text-emerald-800">
                {result.imported}
              </p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-center">
              <p className="text-xs text-sky-700 font-medium">Aggiornate</p>
              <p className="text-lg font-bold text-sky-800">{result.updated}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <p className="text-xs text-slate-500">Escluse / Errori</p>
              <p className="text-lg font-bold text-slate-600">{result.skipped}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <span>
                {showDetails ? "Nascondi elenco pratiche" : "Mostra dettaglio pratiche"}
              </span>
              {showDetails ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            <span className="text-xs text-slate-500">
              Pratiche visibili immediatamente nella scheda Rogitate
            </span>
          </div>

          {showDetails && result.details.length > 0 ? (
            <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Mese</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2 text-right">Mutuo Erogato</th>
                    <th className="px-3 py-2 text-right">Ricavo Totale</th>
                    <th className="px-3 py-2 text-center">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.details.map((d, i) => (
                    <tr key={`${d.clientName}-${i}`} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-medium text-slate-700">
                        {d.month}
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-slate-900">
                        {d.clientName}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {d.loanAmount ? `€ ${d.loanAmount.toLocaleString("it-IT")}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium text-emerald-700">
                        € {d.totalRevenue.toLocaleString("it-IT")}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <Badge
                          variant="outline"
                          className={
                            d.action === "inserted"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800 text-[10px]"
                              : d.action === "updated"
                                ? "border-sky-200 bg-sky-50 text-sky-800 text-[10px]"
                                : "border-slate-200 bg-slate-100 text-slate-600 text-[10px]"
                          }
                        >
                          {d.action === "inserted"
                            ? "Nuova"
                            : d.action === "updated"
                              ? "Aggiornata"
                              : "Skipped"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
