"use client";

import { FileText } from "lucide-react";
import { DocumentPreviewButton } from "@/components/dashboard/document-preview";

export function PackageFileList({
  applicationId,
  token,
  files,
}: {
  applicationId: string;
  token: string;
  files: Array<{ name: string; storageKey: string }>;
}) {
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto border-t border-slate-100 pt-2">
      {files.map((f) => {
        const src = `/api/packages/${applicationId}/file?t=${encodeURIComponent(token)}&key=${encodeURIComponent(f.storageKey)}`;
        return (
          <li
            key={f.storageKey}
            className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <FileText className="h-4 w-4" />
              </span>
              <span className="truncate text-sm font-medium text-slate-800" title={f.name}>
                {f.name}
              </span>
            </div>
            <DocumentPreviewButton
              src={src}
              fileName={f.name}
              label="Anteprima"
            />
          </li>
        );
      })}
    </ul>
  );
}
