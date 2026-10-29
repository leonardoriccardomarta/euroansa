"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "", label: "Tutti" },
  { value: "IN_ATTESA_RISCONTRO_CLIENTE", label: "In attesa di riscontro cliente" },
  { value: "DOCUMENTI_INCOMPLETI", label: "Documenti incompleti" },
  { value: "COMPLETA_DA_INOLTRARE", label: "Completa da inoltrare" },
  { value: "INVIATA_IN_BANCA", label: "Inviata in banca" },
  { value: "DELIBERATA", label: "Deliberata" },
  { value: "PERIZIA_INCARICATA", label: "Perizia incaricata" },
  { value: "PERIZIA_EFFETTUATA", label: "Perizia effettuata" },
  { value: "DELIBERA_FINALE", label: "Delibera finale" },
  { value: "PREPARAZIONE_ATTO", label: "Preparazione atto" },
  { value: "ROGITATA", label: "Rogitata" },
];

export function StatusFilter({ current }: { current?: string }) {
  return (
    <div className="flex w-max min-w-full gap-2 md:w-auto md:flex-wrap">
      {FILTERS.map((f) => {
        const active = (current ?? "") === f.value;
        return (
          <Link
            key={f.value || "all"}
            href={f.value ? `/dashboard?status=${f.value}` : "/dashboard"}
            prefetch
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors active:scale-95",
              active
                ? "bg-primary-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
