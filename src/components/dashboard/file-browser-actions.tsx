"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteDocumentFileAction,
  replaceDocumentFileAction,
  uploadToFolderAction,
} from "@/actions/files";
import type { StorageFolderKind } from "@/lib/config/documents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function FolderUploadButton({
  applicationId,
  folderKind,
  label = "Aggiungi file",
}: {
  applicationId: string;
  folderKind: StorageFolderKind;
  label?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = e.target.files;
          if (!list?.length) return;
          const fd = new FormData();
          Array.from(list).forEach((f) => fd.append("files", f));
          startTransition(async () => {
            const res = await uploadToFolderAction(
              applicationId,
              folderKind,
              fd,
            );
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            const n = "count" in res ? res.count : 0;
            toast.success(`${n ?? 0} file caricati`);
            if ("errors" in res && res.errors?.length) {
              toast.message(res.errors.slice(0, 2).join(" · "));
            }
            router.refresh();
          });
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        disabled={pending}
        className="min-h-10 rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Caricamento..." : label}
      </Button>
    </>
  );
}

export function DocumentFileRow({
  documentId,
  name,
  downloadUrl,
  meta,
}: {
  documentId: string;
  name: string;
  downloadUrl: string | null;
  meta?: string;
}) {
  const router = useRouter();
  const replaceRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-3 first:border-0 first:pt-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {downloadUrl ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            Apri
          </a>
        ) : null}
        <input
          ref={replaceRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("file", f);
            startTransition(async () => {
              const res = await replaceDocumentFileAction(documentId, fd);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("File sostituito");
              router.refresh();
            });
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-9 rounded-lg"
          onClick={() => replaceRef.current?.click()}
        >
          Sostituisci
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-9 rounded-lg border-red-200 text-red-700 hover:bg-red-50"
          onClick={() => {
            if (!window.confirm(`Eliminare "${name}"?`)) return;
            startTransition(async () => {
              const res = await deleteDocumentFileAction(documentId);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("File eliminato");
              router.refresh();
            });
          }}
        >
          Elimina
        </Button>
      </div>
    </div>
  );
}
