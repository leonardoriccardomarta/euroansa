"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { assignBrokerAction } from "@/actions/applications";
import { toast } from "sonner";

export function BrokerAssign({
  applicationId,
  brokerId,
  brokers,
}: {
  applicationId: string;
  brokerId: string | null;
  brokers: Array<{ id: string; name: string; email: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="w-full sm:w-[260px]">
      <label className="mb-1 block text-xs font-medium text-slate-500">
        Broker titolare
      </label>
      <select
        value={brokerId ?? ""}
        disabled={pending || brokers.length === 0}
        className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800"
        onChange={(e) => {
          const next = e.target.value || null;
          startTransition(async () => {
            const res = await assignBrokerAction(applicationId, next);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success(next ? "Broker assegnato" : "Broker rimosso");
            router.refresh();
          });
        }}
      >
        <option value="">Non assegnata</option>
        {brokers.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {brokers.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          Crea utenti con ruolo Broker in Utenti per poterli assegnare.
        </p>
      ) : null}
    </div>
  );
}
