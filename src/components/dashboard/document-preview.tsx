"use client";

import { useState } from "react";
import { Download, Eye, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function previewKind(fileName: string): "pdf" | "image" | "other" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower)) return "image";
  return "other";
}

export function DocumentPreviewButton({
  src,
  fileName,
  label = "Anteprima",
  className,
}: {
  src: string;
  fileName: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
        }
      >
        <Eye className="h-3.5 w-3.5" />
        {label}
      </button>
      {open ? (
        <DocumentPreviewOverlay
          src={src}
          fileName={fileName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function DocumentPreviewOverlay({
  src,
  fileName,
  onClose,
}: {
  src: string;
  fileName: string;
  onClose: () => void;
}) {
  const kind = previewKind(fileName);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/92 backdrop-blur-sm animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{fileName}</p>
          <p className="text-xs text-slate-400">Anteprima</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={src}
            download={fileName}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Scarica</span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 cursor-pointer rounded-xl text-white hover:bg-white/10"
            onClick={onClose}
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
        {kind === "pdf" ? (
          <iframe
            title={fileName}
            src={src}
            className="h-full min-h-[70vh] w-full max-w-5xl rounded-xl bg-white shadow-2xl"
          />
        ) : null}
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={fileName}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        ) : null}
        {kind === "other" ? (
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-8 py-10 text-center">
            <FileText className="h-12 w-12 text-slate-300" />
            <p className="text-sm text-slate-200">
              Anteprima non disponibile per questo tipo di file. Puoi
              scaricarlo.
            </p>
            <a
              href={src}
              download={fileName}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              <Download className="h-4 w-4" />
              Scarica file
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
