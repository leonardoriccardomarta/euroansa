"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  destructive = false,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-0 bg-transparent">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="min-h-10 rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={pending}
            className={
              destructive
                ? "min-h-10 rounded-lg border-red-200 bg-red-600 font-semibold text-white hover:bg-red-700"
                : "min-h-10 rounded-lg bg-primary-600 font-semibold hover:bg-primary-700"
            }
            onClick={onConfirm}
          >
            {pending ? "Attendi..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
