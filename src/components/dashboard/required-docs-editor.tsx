"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { updateRequiredDocumentsAction } from "@/actions/applications";
import type { DocumentType, EmploymentType } from "@/db/schema";
import {
  CHECKLIST_GROUPS,
  CHECKLIST_PRESETS,
  DOCUMENT_TYPE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
} from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PRESET_ORDER: EmploymentType[] = [
  "DIPENDENTE_INDETERMINATO",
  "PARTITA_IVA",
  "PENSIONATO",
  "ALTRO",
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
        toast.success("Checklist pratica aggiornata");
        router.refresh();
      } catch {
        toast.error("Salvataggio checklist fallito");
        router.refresh();
      }
    });
  }

  function toggle(type: DocumentType) {
    const next = selected.includes(type)
      ? selected.filter((t) => t !== type)
      : [...selected, type];
    save(next);
  }

  function applyPreset(preset: EmploymentType) {
    save([...(CHECKLIST_PRESETS[preset] ?? [])]);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Documenti richiesti per questa pratica
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Lista completa foglio Filippo. Usa un preset (Dipendenti / Autonomi /
          Pensionati) poi spunta o togli ciò che serve per questa banca.
        </p>
      </div>

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
            Preset {EMPLOYMENT_TYPE_LABELS[preset]}
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

      <div className="space-y-5">
        {CHECKLIST_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.title}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.types.map((type) => {
                const on = selected.includes(type);
                return (
                  <li key={`${group.id}-${type}`}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggle(type)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition active:scale-[0.99] ${
                        on
                          ? "border-primary-300 bg-primary-50 text-primary-900"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          on
                            ? "border-primary-600 bg-primary-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : ""}
                      </span>
                      {DOCUMENT_TYPE_LABELS[type]}
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
