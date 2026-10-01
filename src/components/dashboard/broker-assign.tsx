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
        disabled={pending}
        className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800"
        onChange={(e) => {
          const next = e.target.value || null;
          startTransition(async () => {
            await assignBrokerAction(applicationId, next);
            toast.success(next ? "Broker assegnato" : "Broker rimosso");
            router.refresh();
          });
        }}
      >
        <option value="">Non assegnata</option>
        {brokers.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.email})
          </option>
        ))}
      </select>
    </div>
  );
}
