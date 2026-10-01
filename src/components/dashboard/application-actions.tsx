"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  getSollecitoTextAction,
  sendToSecretaryAction,
} from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ApplicationActions({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sollecito, setSollecito] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <Button
          disabled={pending}
          className="min-h-11 flex-1 rounded-lg bg-primary-600 font-semibold shadow-md active:scale-95 hover:bg-primary-700 sm:flex-none"
          onClick={() => {
            startTransition(async () => {
              try {
                await sendToSecretaryAction(applicationId);
                toast.success("Inviata a segreteria");
                router.refresh();
              } catch {
                toast.error("Invio fallito. Verifica Google OAuth");
              }
            });
          }}
        >
          {pending ? "Invio..." : "Invia ora a segreteria"}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          className="min-h-11 flex-1 rounded-lg active:scale-95 sm:flex-none"
          onClick={() => {
            startTransition(async () => {
              const res = await getSollecitoTextAction(applicationId);
              if ("text" in res && res.text) {
                setSollecito(res.text);
                await navigator.clipboard.writeText(res.text);
                toast.success("Sollecito copiato");
              }
            });
          }}
        >
          Copia sollecito
        </Button>
      </div>

      {sollecito && (
        <pre className="mt-2 max-w-md whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {sollecito}
        </pre>
      )}
    </div>
  );
}
