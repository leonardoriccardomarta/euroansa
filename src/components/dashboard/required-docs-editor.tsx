"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { updateRequiredDocumentsAction } from "@/actions/applications";
import type { DocumentType, EmploymentType } from "@/db/schema";
import {
  CHECKLIST_PRESETS,
  EMPLOYMENT_TYPE_LABELS,
  SHEET_SECTIONS,
  type SheetChecklistItem,
} from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PRESET_ORDER: EmploymentType[] = [
  "DIPENDENTE_INDETERMINATO",
  "PARTITA_IVA",
  "PENSIONATO",
];

export function RequiredDocsEditor({
  applicationId,
  requiredDocumentTypes,
  suggestedPreset,
}: {
  applicationId: string;
  requiredDocumentTypes: DocumentType[];
  suggestedPreset?: EmploymentType;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(requiredDocumentTypes);

  function save(next: DocumentType[]) {
    startTransition(async () => {
      setSelected(next);
      try {
        await updateRequiredDocumentsAction(applicationId, next);
        toast.success("Checklist aggiornata");
        router.refresh();
      } catch {
        toast.error("Salvataggio fallito");
        router.refresh();
      }
    });
  }

  function isItemOn(item: SheetChecklistItem) {
    return item.types.every((t) => selected.includes(t));
  }

  function toggleItem(item: SheetChecklistItem) {
    const on = isItemOn(item);
    let next: DocumentType[];
    if (on) {
      next = selected.filter((t) => !item.types.includes(t));
    } else {
      next = [...new Set([...selected, ...item.types])];
    }
    save(next);
  }

  function applyPreset(preset: EmploymentType) {
    save([...(CHECKLIST_PRESETS[preset] ?? [])]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {PRESET_ORDER.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant="outline"
            disabled={pending}
            className="h-9 rounded-lg text-xs"
            onClick={() => applyPreset(preset)}
          >
            {EMPLOYMENT_TYPE_LABELS[preset]}
            {suggestedPreset === preset ? " ★" : ""}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={pending || selected.length === 0}
          className="h-9 rounded-lg text-xs text-slate-600"
          onClick={() => save([])}
        >
          Svuota
        </Button>
      </div>

      <div className="space-y-6">
        {SHEET_SECTIONS.map((section, idx) => (
          <div key={`${section.title}-${section.subtitle ?? idx}`}>
            <p className="text-center text-xs font-bold uppercase tracking-wide text-slate-800">
              {section.title}
            </p>
            {section.subtitle ? (
              <p className="mt-2 text-xs font-semibold uppercase text-slate-600">
                {section.subtitle}
              </p>
            ) : null}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {section.items.map((item) => {
                const on = isItemOn(item);
                return (
                  <li key={`${section.subtitle ?? section.title}-${item.label}`}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleItem(item)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs font-medium uppercase transition active:scale-[0.99] sm:text-[13px] ${
                        on
                          ? "border-primary-300 bg-primary-50 text-primary-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                          on
                            ? "border-primary-600 bg-primary-600 text-white"
                            : "border-slate-400 bg-white"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : ""}
                      </span>
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
