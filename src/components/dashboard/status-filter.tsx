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
              "inline-flex h-7 items-center rounded-md border px-2.5 text-[0.8rem] font-medium transition",
              active
                ? "border-transparent bg-emerald-800 text-white"
                : "border-border bg-background text-slate-700 hover:bg-muted",
            )}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
