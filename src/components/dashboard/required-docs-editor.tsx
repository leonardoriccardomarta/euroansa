"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { updateRequiredDocumentsAction } from "@/actions/applications";
import type { DocumentType, EmploymentType } from "@/db/schema";
import {
  CHECKLIST_PRESETS,
  EMPLOYMENT_TYPE_LABELS,
  SHEET_SECTIONS,
  type SheetChecklistItem,
  type SheetSection,
} from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PRESET_ORDER: EmploymentType[] = [
  "DIPENDENTE_INDETERMINATO",
  "PARTITA_IVA",
  "PENSIONATO",
];

/** Sezioni reddituali: stessi tipi (CU, estratto…) ma una sola categoria attiva. */
const INCOME_SUBTITLES = [
  "LAVORATORI DIPENDENTI",
  "LAVORATORI AUTONOMI",
  "PENSIONATI",
] as const;

type IncomeSubtitle = (typeof INCOME_SUBTITLES)[number];

function presetToIncomeSubtitle(
  preset?: EmploymentType | null,
): IncomeSubtitle | null {
  if (preset === "DIPENDENTE_INDETERMINATO") return "LAVORATORI DIPENDENTI";
  if (preset === "PARTITA_IVA") return "LAVORATORI AUTONOMI";
  if (preset === "PENSIONATO") return "PENSIONATI";
  return null;
}

function isIncomeSection(section: SheetSection): section is SheetSection & {
  subtitle: IncomeSubtitle;
} {
  return (
    !!section.subtitle &&
    (INCOME_SUBTITLES as readonly string[]).includes(section.subtitle)
  );
}

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
  const [incomeFocus, setIncomeFocus] = useState<IncomeSubtitle>(
    () => presetToIncomeSubtitle(suggestedPreset) ?? "LAVORATORI DIPENDENTI",
  );

  useEffect(() => {
    const fromPreset = presetToIncomeSubtitle(suggestedPreset);
    if (fromPreset) setIncomeFocus(fromPreset);
  }, [suggestedPreset]);

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

  function selectedCount(item: SheetChecklistItem) {
    return item.types.filter((t) => selected.includes(t)).length;
  }

  function typesFullySelected(item: SheetChecklistItem) {
    return item.types.length > 0 && selectedCount(item) === item.types.length;
  }

  /** Voci ripetute (CU, estratto…) solo nella categoria lavorativa attiva. */
  function itemState(
    item: SheetChecklistItem,
    section: SheetSection,
  ): "off" | "partial" | "on" {
    if (isIncomeSection(section) && section.subtitle !== incomeFocus) {
      return "off";
    }
    const n = selectedCount(item);
    if (n === 0) return "off";
    if (n < item.types.length) return "partial";
    return "on";
  }

  function toggleItem(item: SheetChecklistItem, section: SheetSection) {
    // Click su altra categoria reddituale → sposta il focus (non doppia selezione)
    if (isIncomeSection(section) && section.subtitle !== incomeFocus) {
      setIncomeFocus(section.subtitle);
      if (!typesFullySelected(item)) {
        save([...new Set([...selected, ...item.types])]);
      }
      return;
    }

    const state = itemState(item, section);
    let next: DocumentType[];
    if (state === "on") {
      next = selected.filter((t) => !item.types.includes(t));
    } else {
      // off o parziale → completa tutti gli slot (es. 3 buste)
      next = [...new Set([...selected, ...item.types])];
    }
    save(next);
  }

  function applyPreset(preset: EmploymentType) {
    const sub = presetToIncomeSubtitle(preset);
    if (sub) setIncomeFocus(sub);
    save([...(CHECKLIST_PRESETS[preset] ?? [])]);
  }

  return (
    <div className="space-y-5" data-tour="tour-checklist">
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
              <p
                className={`mt-2 text-xs font-semibold uppercase ${
                  isIncomeSection(section) && section.subtitle === incomeFocus
                    ? "text-primary-700"
                    : "text-slate-600"
                }`}
              >
                {section.subtitle}
                {isIncomeSection(section) && section.subtitle === incomeFocus
                  ? " · attiva"
                  : ""}
              </p>
            ) : null}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {section.items.map((item) => {
                const state = itemState(item, section);
                const n = selectedCount(item);
                const multiHint =
                  item.types.length > 1 && n > 0
                    ? ` (${n}/${item.types.length})`
                    : "";
                return (
                  <li key={`${section.subtitle ?? section.title}-${item.label}`}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleItem(item, section)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs font-medium uppercase transition active:scale-[0.99] sm:text-[13px] ${
                        state === "on"
                          ? "border-primary-300 bg-primary-50 text-primary-900"
                          : state === "partial"
                            ? "border-amber-300 bg-amber-50 text-amber-950"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                          state === "on"
                            ? "border-primary-600 bg-primary-600 text-white"
                            : state === "partial"
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-slate-400 bg-white"
                        }`}
                        aria-hidden
                      >
                        {state === "on" ? "✓" : state === "partial" ? "·" : ""}
                      </span>
                      {item.label}
                      {multiHint}
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
