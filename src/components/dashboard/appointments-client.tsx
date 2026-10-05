"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  createPracticeFromAppointmentAction,
  deleteAppointmentAction,
  upsertAppointmentAction,
} from "@/actions/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPERATION_TYPES } from "@/lib/economics";
import { toast } from "sonner";

type Row = {
  id: string;
  clientName: string;
  phone: string | null;
  provenance: string | null;
  operationType: string | null;
  amount: number | null;
  propertyAmount: number | null;
  notes: string | null;
  hasMandate: boolean;
  appointmentAt: Date | string;
  applicationId: string | null;
};

function dateInput(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

export function AppointmentsClient({
  rows,
  provenanceOptions,
}: {
  rows: Row[];
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
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await upsertAppointmentAction(fd);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("Appuntamento salvato");
            e.currentTarget.reset();
            router.refresh();
          });
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2 lg:col-span-3">
          Nuovo appuntamento
        </p>
        <div className="space-y-1">
          <Label>Cliente</Label>
          <Input name="clientName" required className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Cellulare</Label>
          <Input name="phone" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Data</Label>
          <Input
            name="appointmentAt"
            type="date"
            defaultValue={dateInput(new Date())}
            className="h-10"
          />
        </div>
        <div className="space-y-1">
          <Label>Provenienza</Label>
          <input
            name="provenance"
            list="app-prov"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          />
          <datalist id="app-prov">
            {provenanceOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label>Operazione</Label>
          <select
            name="operationType"
            defaultValue="MUTUO"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          >
            {OPERATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Importo</Label>
          <Input name="amount" className="h-10" placeholder="opzionale" />
        </div>
        <div className="space-y-1">
          <Label>Casa €</Label>
          <Input name="propertyAmount" className="h-10" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="hasMandate" className="size-4" />
          Incarico firmato
        </label>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label>Note</Label>
          <Input name="notes" className="h-10" />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-10 bg-primary-600 sm:col-span-2 lg:col-span-3"
        >
          Aggiungi
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Prov.</th>
              <th className="px-3 py-2">Op.</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2">Incarico</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Nessun appuntamento.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium">
                    {r.clientName}
                    <div className="text-xs text-slate-500">{r.phone}</div>
                  </td>
                  <td className="px-3 py-2">
                    {new Date(r.appointmentAt).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-3 py-2">{r.provenance ?? "—"}</td>
                  <td className="px-3 py-2">{r.operationType ?? "—"}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-600">
                    {r.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2">{r.hasMandate ? "Sì" : "No"}</td>
                  <td className="space-x-2 px-3 py-2 text-right whitespace-nowrap">
                    {r.applicationId ? (
                      <Link
                        href={`/dashboard/applications/${r.applicationId}`}
                        className="text-xs font-semibold text-primary-700"
                      >
                        Pratica
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary-700"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await createPracticeFromAppointmentAction(r.id);
                            if (res && "error" in res && res.error) {
                              toast.error(res.error);
                              return;
                            }
                            toast.success("Pratica creata");
                            if (res.ok && res.applicationId) {
                              router.push(
                                `/dashboard/applications/${res.applicationId}`,
                              );
                            }
                            router.refresh();
                          });
                        }}
                      >
                        Crea pratica
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await deleteAppointmentAction(r.id);
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
