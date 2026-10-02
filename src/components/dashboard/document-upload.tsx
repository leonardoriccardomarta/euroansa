"use client";

import { useState, useTransition } from "react";
import { uploadDocumentsAction } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DocumentUpload({ applicationId }: { applicationId: string }) {
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const formData = new FormData();
    Array.from(fileList).forEach((f) => formData.append("files", f));

    startTransition(async () => {
      try {
        const res = await uploadDocumentsAction(applicationId, formData);
        toast.success(`${res.count} file elaborati`);
      } catch {
        toast.error("Upload o analisi fallita. Verifica Gemini e storage Blob");
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
