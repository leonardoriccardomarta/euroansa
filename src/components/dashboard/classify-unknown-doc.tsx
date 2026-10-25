"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { classifyUnknownDocumentAction } from "@/actions/files";
import type { DocumentType } from "@/db/schema";
import { DOCUMENT_TYPE_LABELS } from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ClassifyUnknownDoc({
  documentId,
  options,
  currentType,
}: {
  documentId: string;
  /** Tipi checklist tra cui scegliere */
  options: DocumentType[];
  /** Se già tipizzato → bottone "Cambia tipo" */
  currentType?: DocumentType | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!options.length) return null;

  const isUnknown = !currentType || currentType === "SCONOSCIUTO";
  const label = isUnknown ? "Classifica…" : "Cambia tipo…";

  return (
    <div className="mt-2">
      {!open ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setOpen(true)}
        >
          {label}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 max-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-xs"
            disabled={pending}
          >
            <option value="">Tipo checklist…</option>
            {options.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-primary-600 text-xs hover:bg-primary-700"
            disabled={pending || !value}
            onClick={() => {
              startTransition(async () => {
                const res = await classifyUnknownDocumentAction(
                  documentId,
                  value as DocumentType,
                );
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success(
                  res.renamedFileName
                    ? `Aggiornato · ${res.renamedFileName}`
                    : "Tipo aggiornato",
                );
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {pending ? "…" : "Conferma"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Annulla
          </Button>
        </div>
      )}
    </div>
  );
}
