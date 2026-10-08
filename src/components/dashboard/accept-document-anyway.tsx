"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acceptDocumentAnywayAction } from "@/actions/files";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Filippo/broker: spunta il doc anche se l'AI lo ha bocciato. */
export function AcceptDocumentAnyway({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-2 h-8 border-amber-300 text-xs text-amber-900 hover:bg-amber-50"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await acceptDocumentAnywayAction(documentId);
          if (res && "error" in res && res.error) {
            toast.error(res.error);
            return;
          }
          toast.success("Documento accettato — conta per la checklist");
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "Accetta comunque"}
    </Button>
  );
}
