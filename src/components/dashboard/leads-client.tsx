"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteLeadAction, upsertLeadAction } from "@/actions/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEAD_OUTCOMES } from "@/lib/economics";
import { toast } from "sonner";

type LeadRow = {
  id: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  provenance: string | null;
  outcome: string | null;
  notes: string | null;
  activityMonth: Date | string;
};

function monthValue(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function LeadsClient({
  rows,
  provenanceOptions,
}: {
  rows: LeadRow[];
  provenanceOptions: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          startTransition(async () => {
            const res = await upsertLeadAction(fd);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("Lead salvato");
            form.reset();
            router.refresh();
          });
        }}
      >
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nuovo lead
          </p>
        </div>
        <div className="space-y-1">
          <Label>Cliente</Label>
          <Input name="clientName" required className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Cellulare</Label>
          <Input name="phone" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Mail</Label>
          <Input name="email" type="email" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Provenienza</Label>
          <input
            name="provenance"
            list="lead-prov"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          />
          <datalist id="lead-prov">
            {provenanceOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label>Esito chiamata</Label>
          <select
            name="outcome"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          >
            <option value="">—</option>
            {LEAD_OUTCOMES.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Mese</Label>
          <Input
            name="activityMonth"
            type="month"
            defaultValue={monthValue(new Date())}
            className="h-10"
          />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label>Note (con data)</Label>
          <Input
            name="notes"
            placeholder="01_01 …"
            className="h-10"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-10 bg-primary-600 sm:col-span-2 lg:col-span-3"
        >
          Aggiungi lead
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Cell</th>
              <th className="px-3 py-2">Provenienza</th>
              <th className="px-3 py-2">Esito</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Nessun lead. Aggiungine uno sopra.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium">{r.clientName}</td>
                  <td className="px-3 py-2">{r.phone ?? "—"}</td>
                  <td className="px-3 py-2">{r.provenance ?? "—"}</td>
                  <td className="px-3 py-2">
                    {LEAD_OUTCOMES.find((o) => o.key === r.outcome)?.label ??
                      "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-slate-600">
                    {r.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await deleteLeadAction(r.id);
                          router.refresh();
                        });
                      }}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
