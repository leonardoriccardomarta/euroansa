"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { uploadFilesDirectToR2 } from "@/lib/storage/direct-upload";
import { toast } from "sonner";

export function DocumentUpload({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    startTransition(async () => {
      try {
        const res = await uploadFilesDirectToR2({
          applicationId,
          files,
        });
        if (res.count > 0) {
          toast.success(`${res.count} file caricati e analizzati`);
        }
        if (res.errors.length > 0) {
          toast.error(
            res.errors.slice(0, 2).join("; ") +
              (res.errors.length > 2 ? ` (+${res.errors.length - 2})` : ""),
          );
        } else if (res.count === 0) {
          toast.message("Nessun file nuovo elaborato");
        }
        router.refresh();
      } catch {
        toast.error("Upload o analisi fallita. Verifica Gemini e storage R2");
        router.refresh();
      }
    });
  }

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-6 text-center transition ${
        dragOver
          ? "border-primary-600 bg-primary-50"
          : "border-slate-300 bg-slate-50"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <p className="mb-3 text-sm text-slate-600">
        Trascina qui PDF o immagini, oppure seleziona i file
      </p>
      <p className="mb-3 text-xs text-slate-500">
        Upload diretto su storage (più veloce)
      </p>
      <input
        id="file-upload"
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="min-h-11 cursor-pointer rounded-lg active:scale-95"
        onClick={() => document.getElementById("file-upload")?.click()}
      >
        {pending ? "Upload + AI..." : "Carica documenti"}
      </Button>
    </div>
  );
}
