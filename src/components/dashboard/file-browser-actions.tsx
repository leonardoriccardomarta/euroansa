"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createClientFolderAction,
  createStorageFolderAction,
  deleteDocumentFileAction,
  deleteStorageFolderAction,
  moveDocumentFolderAction,
  renameStorageFolderAction,
  reorderStorageFolderAction,
  replaceDocumentFileAction,
} from "@/actions/files";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { uploadFilesDirectToR2 } from "@/lib/storage/direct-upload";
import { DocumentPreviewButton } from "@/components/dashboard/document-preview";
import { RenameDocumentDialog } from "@/components/dashboard/rename-document-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronDown,
  ChevronUp,
  FolderInput,
  Pencil,
  User,
  Users2,
} from "lucide-react";
import { toast } from "sonner";

/** AI/checklist solo su DOC e IMMOBILE; BANCA/EUROANSA = firmati, no AI */
function folderUsesAi(folderName: string): boolean {
  const t = folderName.trim().toUpperCase();
  if (t === "BANCA" || t === "EUROANSA" || t === "UFFICIO") return false;
  if (t === "IMMOBILE") return true;
  if (/\sDOC$/i.test(t) || t.endsWith(" DOC")) return true;
  return false;
}

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
          const files = Array.from(list);
          e.target.value = "";
          startTransition(async () => {
            try {
              const res = await uploadFilesDirectToR2({
                applicationId,
                files,
                subfolder: folderName,
                skipAi: !folderUsesAi(folderName),
              });
              if (res.count > 0) {
                toast.success(`${res.count} file caricati`);
              }
              if (res.errors.length) {
                toast.error(res.errors.slice(0, 3).join("; "));
              } else if (res.count === 0) {
                toast.error(
                  "Nessun file elaborato — riprova o rinomina se già in pratica",
                );
              }
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Caricamento fallito. Riprova",
              );
            }
            router.refresh();
          });
        }}
      />
      <Button
        type="button"
        disabled={pending}
        className="min-h-10 cursor-pointer rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
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
  const [isCouple, setIsCouple] = useState(false);
  const [name, setName] = useState("");
  const [clientFiscalCode, setClientFiscalCode] = useState("");
  const [coApplicantName, setCoApplicantName] = useState("");
  const [coApplicantFiscalCode, setCoApplicantFiscalCode] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      data-tour="tour-create-folder"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const value = name.trim();
        if (!value) return;
        if (isCouple && !coApplicantName.trim()) {
          toast.error("Inserisci il nome del Richiedente 2");
          return;
        }

        startTransition(async () => {
          const res = await createClientFolderAction({
            clientName: value,
            clientFiscalCode: clientFiscalCode.trim() || null,
            isCouple,
            coApplicantName: isCouple ? coApplicantName.trim() : null,
            coApplicantFiscalCode: isCouple
              ? coApplicantFiscalCode.trim()
              : null,
          });
          if (res && "error" in res && res.error) {
            toast.error(res.error);
            return;
          }
          toast.success("Cartella cliente creata");
          setName("");
          setClientFiscalCode("");
          setCoApplicantName("");
          setCoApplicantFiscalCode("");
          setIsCouple(false);
          if (res && "applicationId" in res && res.applicationId) {
            router.push(`/dashboard/files/${res.applicationId}`);
          } else {
            router.refresh();
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-semibold text-slate-900">
            Nuova cartella / pratica cliente
          </h3>
          <p className="text-xs text-slate-500">
            Crea la cartella storage con le sezioni dedicate e la pratica associata
          </p>
        </div>

        {/* Tipo Pratica Selector */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setIsCouple(false)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
              !isCouple
                ? "bg-white font-semibold text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Singola
          </button>
          <button
            type="button"
            onClick={() => setIsCouple(true)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
              isCouple
                ? "bg-sky-600 font-semibold text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users2 className="h-3.5 w-3.5" />
            Coppia
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Richiedente 1 */}
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <Label className="text-xs font-bold text-slate-700">
            {isCouple ? "Richiedente 1 (Intestatario principale)" : "Cliente"}
          </Label>
          <div className="space-y-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome e cognome"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
              required
            />
          </div>
          <div className="space-y-1.5">
            <input
              value={clientFiscalCode}
              onChange={(e) => setClientFiscalCode(e.target.value.toUpperCase())}
              placeholder="Codice Fiscale (opzionale)"
              maxLength={16}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs uppercase outline-none focus:border-primary-400"
            />
          </div>
        </div>

        {/* Richiedente 2 (se Coppia) */}
        {isCouple ? (
          <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/40 p-3">
            <Label className="text-xs font-bold text-sky-900">
              Richiedente 2 (Co-intestatario)
            </Label>
            <div className="space-y-1.5">
              <input
                value={coApplicantName}
                onChange={(e) => setCoApplicantName(e.target.value)}
                placeholder="Nome e cognome 2° richiedente"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"
                required={isCouple}
              />
            </div>
            <div className="space-y-1.5">
              <input
                value={coApplicantFiscalCode}
                onChange={(e) =>
                  setCoApplicantFiscalCode(e.target.value.toUpperCase())
                }
                placeholder="Codice Fiscale 2° richiedente"
                maxLength={16}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs uppercase outline-none focus:border-sky-400"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            Per pratiche cointestate seleziona &quot;Coppia&quot; per creare
            automaticamente le cartelle separate Richiedente 1, Richiedente 2 e
            Immobile.
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          disabled={pending || !name.trim() || (isCouple && !coApplicantName.trim())}
          className="min-h-10 rounded-lg bg-primary-600 px-5 font-semibold hover:bg-primary-700"
        >
          {pending ? "Creazione in corso..." : "Crea cartella"}
        </Button>
      </div>
    </form>
  );
}

export function RenameFolderDialog({
  applicationId,
  currentName,
}: {
  applicationId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-lg px-2.5 text-slate-700 hover:bg-slate-100"
        title="Rinomina cartella"
        onClick={() => {
          setName(currentName);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Rinomina</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina cartella</DialogTitle>
            <DialogDescription>
              Modifica il nome della cartella &quot;{currentName}&quot;. I file
              manterranno il loro contenuto e verranno visualizzati sotto il nuovo
              nome.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="folder-new-name">Nuovo nome</Label>
            <Input
              id="folder-new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Annulla
            </Button>
            <Button
              type="button"
              disabled={pending || !name.trim() || name.trim() === currentName}
              onClick={() => {
                const target = name.trim();
                if (!target) return;
                startTransition(async () => {
                  const res = await renameStorageFolderAction(
                    applicationId,
                    currentName,
                    target,
                  );
                  if (res && "error" in res && res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Cartella rinominata");
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              {pending ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FolderReorderButtons({
  applicationId,
  folderName,
  isFirst,
  isLast,
}: {
  applicationId: string;
  folderName: string;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const move = (direction: "up" | "down") => {
    startTransition(async () => {
      const res = await reorderStorageFolderAction(
        applicationId,
        folderName,
        direction,
      );
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        direction === "up" ? "Cartella spostata su" : "Cartella spostata giù",
      );
      router.refresh();
    });
  };

  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        disabled={pending || isFirst}
        onClick={() => move("up")}
        className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30"
        title="Sposta cartella su"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <div className="h-4 w-px bg-slate-200" />
      <button
        type="button"
        disabled={pending || isLast}
        onClick={() => move("down")}
        className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30"
        title="Sposta cartella giù"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

export function MoveDocumentSelect({
  documentId,
  currentFolder,
  availableFolders,
}: {
  documentId: string;
  currentFolder: string;
  availableFolders: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!availableFolders || availableFolders.length <= 1) return null;

  return (
    <div className="relative inline-flex items-center">
      <FolderInput className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
      <select
        value={currentFolder}
        disabled={pending}
        onChange={(e) => {
          const target = e.target.value;
          if (!target || target === currentFolder) return;
          startTransition(async () => {
            const res = await moveDocumentFolderAction(documentId, target);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success(`Spostato in "${target}"`);
            router.refresh();
          });
        }}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium text-slate-700 shadow-sm outline-none hover:bg-slate-50 focus:border-primary-400"
        title="Sposta file in un'altra cartella"
      >
        {availableFolders.map((f) => (
          <option key={f} value={f}>
            {f === currentFolder ? `In: ${f}` : `Sposta in: ${f}`}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400" />
    </div>
  );
}

export function DocumentFileRow({
  documentId,
  name,
  downloadUrl,
  meta,
  legacyDrive = false,
  availableFolders,
  currentFolder,
}: {
  documentId: string;
  name: string;
  downloadUrl: string | null;
  meta?: string;
  legacyDrive?: boolean;
  availableFolders?: string[];
  currentFolder?: string;
}) {
  const router = useRouter();
  const replaceRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-3 first:border-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
        {legacyDrive ? (
          <p className="text-xs font-medium text-amber-700">
            Solo Drive — usa Sostituisci per metterlo sullo storage sito
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {availableFolders && currentFolder ? (
          <MoveDocumentSelect
            documentId={documentId}
            currentFolder={currentFolder}
            availableFolders={availableFolders}
          />
        ) : null}
        {downloadUrl && !legacyDrive ? (
          <DocumentPreviewButton
            src={downloadUrl}
            fileName={name}
            label="Anteprima"
          />
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
        <RenameDocumentDialog
          documentId={documentId}
          currentName={name}
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
