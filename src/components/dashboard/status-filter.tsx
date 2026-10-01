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
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const active = (current ?? "") === f.value;
        return (
          <Link
            key={f.value || "all"}
            href={f.value ? `/dashboard?status=${f.value}` : "/dashboard"}
            className={cn(
              "inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium transition-colors",
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
