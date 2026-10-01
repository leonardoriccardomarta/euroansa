"use client";

import Link from "next/link";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "", label: "Tutti" },
  ...Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
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
