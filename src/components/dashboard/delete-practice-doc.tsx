"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDocumentFileAction } from "@/actions/files";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

export function DeletePracticeDoc({
  documentId,
  fileName,
}: {
  documentId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-8 border-red-200 text-xs text-red-700 hover:bg-red-50"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Elimina
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Eliminare il file?"
        description={`"${fileName}" verrà rimosso dalla pratica e dallo storage.`}
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
            setOpen(false);
            toast.success("File eliminato");
            router.refresh();
          });
        }}
      />
    </>
  );
}
