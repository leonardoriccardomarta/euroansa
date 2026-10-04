"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { uploadDocumentsAction } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DocumentUpload({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const formData = new FormData();
    Array.from(fileList).forEach((f) => formData.append("files", f));

    startTransition(async () => {
      try {
        const res = await uploadDocumentsAction(applicationId, formData);
        if (res && "error" in res && res.error) {
          toast.error(res.error);
          router.refresh();
          return;
        }
        const count = "count" in res && typeof res.count === "number" ? res.count : 0;
        const errors = "errors" in res && res.errors ? res.errors : [];
        if (count > 0) {
          toast.success(`${count} file elaborati`);
        }
        if (errors.length > 0) {
          toast.error(
            errors.slice(0, 2).join("; ") +
              (errors.length > 2 ? ` (+${errors.length - 2})` : ""),
          );
        } else if (count === 0) {
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
        className="min-h-11 rounded-lg active:scale-95"
        onClick={() => document.getElementById("file-upload")?.click()}
      >
        {pending ? "Elaborazione AI..." : "Carica documenti"}
      </Button>
    </div>
  );
}
