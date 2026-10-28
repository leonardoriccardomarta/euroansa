"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createPracticeFromAppointmentAction,
  deleteAppointmentAction,
  upsertAppointmentAction,
} from "@/actions/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, Users2 } from "lucide-react";
import { OPERATION_TYPES } from "@/lib/economics";
import { toast } from "sonner";

type Row = {
  id: string;
  clientName: string;
  phone: string | null;
  email: string | null;
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

  const [createPracticeRow, setCreatePracticeRow] = useState<Row | null>(null);
  const [isCouple, setIsCouple] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientFiscalCode, setClientFiscalCode] = useState("");
  const [coApplicantName, setCoApplicantName] = useState("");
  const [coApplicantFiscalCode, setCoApplicantFiscalCode] = useState("");

  const openCreateModal = (r: Row) => {
    setCreatePracticeRow(r);
    setClientName(r.clientName);
    setClientFiscalCode("");
    setIsCouple(false);
    setCoApplicantName("");
    setCoApplicantFiscalCode("");
  };

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
          <Label>Email cliente</Label>
          <Input name="email" type="email" className="h-10" />
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
                    {r.email ? (
                      <div className="text-xs text-slate-400">{r.email}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {new Date(r.appointmentAt).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-3 py-2">{r.provenance ?? "n.d."}</td>
                  <td className="px-3 py-2">{r.operationType ?? "n.d."}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-600">
                    {r.notes ?? "n.d."}
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
                        className="text-xs font-semibold text-primary-700 hover:underline"
                        disabled={pending}
                        onClick={() => openCreateModal(r)}
                      >
                        Crea pratica
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 hover:underline"
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

      {/* Modal Crea Pratica da Appuntamento */}
      <Dialog
        open={Boolean(createPracticeRow)}
        onOpenChange={(open) => !open && setCreatePracticeRow(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crea Pratica da Appuntamento</DialogTitle>
            <DialogDescription>
              Genera la cartella storage e il fascicolo di istruttoria per
              questo contatto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipo Pratica Selector */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2">
              <span className="text-xs font-medium text-slate-700">
                Tipo Pratica:
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium shadow-xs">
                <button
                  type="button"
                  onClick={() => setIsCouple(false)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                    !isCouple
                      ? "bg-primary-600 font-semibold text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  Singola
                </button>
                <button
                  type="button"
                  onClick={() => setIsCouple(true)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                    isCouple
                      ? "bg-sky-600 font-semibold text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Users2 className="h-3.5 w-3.5" />
                  Coppia
                </button>
              </div>
            </div>

            {/* Richiedente 1 */}
            <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <Label className="text-xs font-bold text-slate-700">
                {isCouple ? "Richiedente 1 (Principale)" : "Richiedente"}
              </Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nome e cognome"
                className="h-9"
              />
              <Input
                value={clientFiscalCode}
                onChange={(e) =>
                  setClientFiscalCode(e.target.value.toUpperCase())
                }
                placeholder="Codice Fiscale (opzionale)"
                maxLength={16}
                className="h-9 text-xs uppercase"
              />
            </div>

            {/* Richiedente 2 */}
            {isCouple && (
              <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/40 p-3">
                <Label className="text-xs font-bold text-sky-900">
                  Richiedente 2 (Co-intestatario)
                </Label>
                <Input
                  value={coApplicantName}
                  onChange={(e) => setCoApplicantName(e.target.value)}
                  placeholder="Nome e cognome 2° richiedente"
                  className="h-9"
                />
                <Input
                  value={coApplicantFiscalCode}
                  onChange={(e) =>
                    setCoApplicantFiscalCode(e.target.value.toUpperCase())
                  }
                  placeholder="Codice Fiscale 2° richiedente"
                  maxLength={16}
                  className="h-9 text-xs uppercase"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setCreatePracticeRow(null)}
            >
              Annulla
            </Button>
            <Button
              type="button"
              disabled={
                pending ||
                !clientName.trim() ||
                (isCouple && !coApplicantName.trim())
              }
              className="bg-primary-600 font-semibold text-white hover:bg-primary-700"
              onClick={() => {
                if (!createPracticeRow) return;
                startTransition(async () => {
                  const res = await createPracticeFromAppointmentAction(
                    createPracticeRow.id,
                    {
                      clientName,
                      clientFiscalCode,
                      isCouple,
                      coApplicantName: isCouple ? coApplicantName : null,
                      coApplicantFiscalCode: isCouple
                        ? coApplicantFiscalCode
                        : null,
                    },
                  );
                  if (res && "error" in res && res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Pratica creata");
                  setCreatePracticeRow(null);
                  if ("applicationId" in res && res.applicationId) {
                    router.push(
                      `/dashboard/applications/${res.applicationId}`,
                    );
                  }
                  router.refresh();
                });
              }}
            >
              {pending ? "Creazione..." : "Crea Pratica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
