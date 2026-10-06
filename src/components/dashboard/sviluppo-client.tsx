"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteAgencyDevAction, upsertAgencyDevAction } from "@/actions/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  typology: string | null;
  phone: string | null;
  ownerName: string | null;
  phase: string;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
  clientDone: number;
  visitCount: number;
  appointmentCount: number;
  collaboration: number;
  appCount: number;
  notes: string | null;
};

export function SviluppoClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await upsertAgencyDevAction(fd);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("Agenzia salvata");
            e.currentTarget.reset();
            router.refresh();
          });
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2 lg:col-span-4">
          Nuova agenzia / contatto
        </p>
        <div className="space-y-1">
          <Label>Nome</Label>
          <Input name="name" required className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Tipologia</Label>
          <Input name="typology" placeholder="Tecnocasa…" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Titolare</Label>
          <Input name="ownerName" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Fase</Label>
          <select
            name="phase"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          >
            <option value="CONTATTO">Contatto</option>
            <option value="CONSOLIDAMENTO">Consolidamento</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Sett. 1</Label>
          <Input name="week1" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Sett. 2</Label>
          <Input name="week2" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Sett. 3</Label>
          <Input name="week3" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Sett. 4</Label>
          <Input name="week4" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Cliente fatto</Label>
          <Input name="clientDone" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Visite</Label>
          <Input name="visitCount" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Appuntamenti</Label>
          <Input name="appointmentCount" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label>Collaborazione</Label>
          <Input name="collaboration" defaultValue="0" className="h-10" />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-4">
          <Label>Note</Label>
          <Input name="notes" className="h-10" />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-10 bg-primary-600 sm:col-span-2 lg:col-span-4"
        >
          Salva
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Agenzia</th>
              <th className="px-3 py-2">Fase</th>
              <th className="px-3 py-2">S1 S4</th>
              <th className="px-3 py-2">Visite / App</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Nessuna agenzia in sviluppo.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {[r.typology, r.ownerName].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className="px-3 py-2">{r.phase}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.week1}/{r.week2}/{r.week3}/{r.week4}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.visitCount} / {r.appointmentCount}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await deleteAgencyDevAction(r.id);
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
