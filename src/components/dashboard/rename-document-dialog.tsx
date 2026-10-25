"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { renameDocumentFileAction } from "@/actions/files";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RenameDocumentDialog({
  documentId,
  currentName,
  buttonVariant = "outline",
  size = "sm",
}: {
  documentId: string;
  currentName: string;
  buttonVariant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [pending, startTransition] = useTransition();

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      setName(currentName);
    }
    setOpen(isOpen);
  }

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Inserisci un nome valido");
      return;
    }

    startTransition(async () => {
      const res = await renameDocumentFileAction(documentId, trimmed);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`File rinominato in ${res.renamedFileName}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={size}
        className="h-9 gap-1.5 rounded-lg text-slate-700 hover:bg-slate-50"
        onClick={() => handleOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5 text-slate-500" />
        Rinomina
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-slate-900">
                Rinomina file
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-600">
                Modifica il nome del file. L&apos;estensione .pdf verrà
                preservata automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Nome file standardizzato
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                autoFocus
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>

            <DialogFooter className="border-0 bg-transparent gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                className="min-h-10 rounded-lg"
                onClick={() => setOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={pending || !name.trim()}
                className="min-h-10 rounded-lg bg-primary-600 font-semibold text-white hover:bg-primary-700"
              >
                {pending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
