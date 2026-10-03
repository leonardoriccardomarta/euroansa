"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createClientFolderAction,
  createStorageFolderAction,
  deleteDocumentFileAction,
  deleteStorageFolderAction,
  replaceDocumentFileAction,
  uploadToFolderAction,
} from "@/actions/files";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

export function FolderUploadButton({
  applicationId,
  folderName,
  label = "Nuovo file",
}: {
  applicationId: string;
  folderName: string;
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
              folderName,
              fd,
            );
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            const n = "count" in res ? res.count : 0;
            toast.success(`${n ?? 0} file caricati`);
            if ("errors" in res && res.errors?.length) {
              toast.message(res.errors.slice(0, 2).join("; "));
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

export function DeleteFolderButton({
  applicationId,
  folderName,
}: {
  applicationId: string;
  folderName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="min-h-10 rounded-lg border-red-200 text-red-700 hover:bg-red-50"
        onClick={() => setConfirmDelete(true)}
      >
        {pending ? "..." : "Elimina cartella"}
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminare la cartella?"
        description={`"${folderName}" e tutti i file al suo interno verranno rimossi.`}
        confirmLabel="Elimina"
        destructive
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const res = await deleteStorageFolderAction(
              applicationId,
              folderName,
            );
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            setConfirmDelete(false);
            toast.success("Cartella eliminata");
            router.refresh();
          });
        }}
      />
    </>
  );
}

export function CreateFolderForm({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = name.trim();
        if (!value) return;
        startTransition(async () => {
          const res = await createStorageFolderAction(applicationId, value);
          if (res && "error" in res && res.error) {
            toast.error(res.error);
            return;
          }
          toast.success("Cartella creata");
          setName("");
          router.refresh();
        });
      }}
    >
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Nuova cartella
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. VARIE, CONTRATTI…"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !name.trim()}
        className="min-h-10 rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
      >
        {pending ? "..." : "Crea cartella"}
      </Button>
    </form>
  );
}

export function CreateClientFolderForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const value = name.trim();
        if (!value) return;
        startTransition(async () => {
          const res = await createClientFolderAction(value);
          if (res && "error" in res && res.error) {
            toast.error(res.error);
            return;
          }
          toast.success("Cartella cliente creata");
          setName("");
          if (res && "applicationId" in res && res.applicationId) {
            router.push(`/dashboard/files/${res.applicationId}`);
          } else {
            router.refresh();
          }
        });
      }}
    >
      <div className="min-w-[220px] flex-1">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Nuova cartella cliente
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome e cognome cliente"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !name.trim()}
        className="min-h-10 rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
      >
        {pending ? "..." : "Crea"}
      </Button>
    </form>
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          onClick={() => setConfirmDelete(true)}
        >
          Elimina
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminare il file?"
        description={`"${name}" verrà rimosso dallo storage.`}
        confirmLabel="Elimina"
        destructive
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const res = await deleteDocumentFileAction(documentId);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            setConfirmDelete(false);
            toast.success("File eliminato");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
