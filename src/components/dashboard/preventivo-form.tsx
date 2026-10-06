"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { generatePreventivoAction } from "@/actions/phase3";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PreventivoData } from "@/db/schema";
import { toast } from "sonner";

function numStr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return String(n);
}

export function PreventivoForm({
  applicationId,
  clientName,
  defaults,
  hasPdf,
  fileName,
}: {
  applicationId: string;
  clientName: string;
  defaults: PreventivoData & {
    bankName?: string | null;
    propertyAmount?: number | null;
    loanAmount?: number | null;
  };
  hasPdf: boolean;
  fileName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Preventivo</h3>
          <p className="mt-1 text-sm text-slate-600">
            Compila i dati e genera un PDF pronto da consegnare al cliente ({clientName}).
          </p>
          {hasPdf ? (
            <p className="mt-2 text-sm text-emerald-700">
              <a
                href={`/api/applications/${applicationId}/preventivo`}
                className="font-medium underline"
                target="_blank"
                rel="noreferrer"
              >
                {fileName ?? "preventivo.pdf"}
              </a>
            </p>
          ) : null}
        </div>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await generatePreventivoAction(applicationId, fd);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("Preventivo PDF generato");
            router.refresh();
          });
        }}
      >
        <Field label="Costo casa (€)" name="propertyAmount" defaultValue={numStr(defaults.propertyAmount)} />
        <Field label="Importo mutuo (€)" name="loanAmount" defaultValue={numStr(defaults.loanAmount)} />
        <Field label="Durata (anni)" name="durationYears" defaultValue={numStr(defaults.durationYears)} />
        <Field label="Rata (€)" name="monthlyInstallment" defaultValue={numStr(defaults.monthlyInstallment)} />
        <Field label="Tasso %" name="ratePercent" defaultValue={numStr(defaults.ratePercent)} />
        <Field label="Nota tasso" name="rateNote" defaultValue={defaults.rateNote ?? ""} />
        <Field label="Banca" name="bankName" defaultValue={defaults.bankName ?? ""} />
        <Field label="Prodotto" name="productNote" defaultValue={defaults.productNote ?? ""} />
        <Field label="Istruttoria/perizia (€)" name="feeIstruttoria" defaultValue={numStr(defaults.feeIstruttoria)} />
        <Field label="Imposta sostitutiva (€)" name="feeImposta" defaultValue={numStr(defaults.feeImposta)} />
        <Field label="Mediazione (€)" name="feeMediazione" defaultValue={numStr(defaults.feeMediazione)} />
        <Field label="Altre spese (€)" name="feeOther" defaultValue={numStr(defaults.feeOther)} />
        <Field label="Etichetta altre spese" name="feeOtherLabel" defaultValue={defaults.feeOtherLabel ?? ""} />
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label>Note</Label>
          <textarea
            name="notes"
            defaultValue={defaults.notes ?? ""}
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button
            type="submit"
            disabled={pending}
            className="min-h-10 bg-primary-600 font-semibold hover:bg-primary-700"
          >
            {pending ? "Generazione..." : hasPdf ? "Rigenera PDF preventivo" : "Genera PDF preventivo"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input name={name} defaultValue={defaultValue} className="h-10" />
    </div>
  );
}
