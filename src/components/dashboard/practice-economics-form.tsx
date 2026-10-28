"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updatePracticeEconomicsAction } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUDIT_FIELDS,
  OPERATION_TYPES,
  collaboratorPayout,
  formatEuro,
  parseEuroExpression,
  practiceRevenue,
  revenueOnLoanPercent,
} from "@/lib/economics";
import { toast } from "sonner";

type EconomicsValues = {
  clientName: string;
  clientEmail: string;
  provenance: string | null;
  bankName: string | null;
  operationType: string | null;
  phone: string | null;
  loanAmount: number | null;
  propertyAmount: number | null;
  ltvPercent: number | null;
  notaryName: string | null;
  appraiserName: string | null;
  commissionClient: number | null;
  commissionBank: number | null;
  commissionPolicy: number | null;
  commissionCqs: number | null;
  commissionLoans: number | null;
  commissionNotary: number | null;
  rogitoAt: Date | string | null;
  auditPrivacy: boolean;
  auditContractSigned: boolean;
  auditInstituteSheet: boolean;
  auditDdmBank: boolean;
  auditOriginalsVerified: boolean;
  auditArchive: boolean;
  economicNotes: string | null;
};

function toDateInput(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function numStr(v: number | null | undefined): string {
  if (v == null) return "";
  return String(v);
}

export function PracticeEconomicsForm({
  applicationId,
  values,
  provenanceOptions,
  collaboratorSharePercent,
  brokerSharePercent,
  showOverride,
  overrideSharePercent,
}: {
  applicationId: string;
  values: EconomicsValues;
  provenanceOptions: string[];
  collaboratorSharePercent: number;
  brokerSharePercent?: number | null;
  /** Override nascosta: solo se il viewer ha diritto e non è il titolare. */
  showOverride?: boolean;
  overrideSharePercent?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [shareMode, setShareMode] = useState<"standard" | "100" | "custom">(() => {
    if (brokerSharePercent != null) {
      if (Math.abs(brokerSharePercent - 1) < 0.001) return "100";
      if (Math.abs(brokerSharePercent - collaboratorSharePercent) < 0.001)
        return "standard";
      return "custom";
    }
    return "standard";
  });

  const [customShare, setCustomShare] = useState<string>(() => {
    if (brokerSharePercent != null && Math.abs(brokerSharePercent - 1) >= 0.001) {
      return String(Math.round(brokerSharePercent * 100));
    }
    return String(Math.round(collaboratorSharePercent * 100));
  });

  const activeBrokerSharePercent = useMemo(() => {
    if (shareMode === "100") return 1.0;
    if (shareMode === "custom") {
      const val = parseFloat(customShare);
      if (!isNaN(val) && val >= 0) {
        return Math.min(100, val) / 100;
      }
      return collaboratorSharePercent;
    }
    return collaboratorSharePercent;
  }, [shareMode, customShare, collaboratorSharePercent]);

  const [live, setLive] = useState({
    commissionClient: values.commissionClient,
    commissionBank: values.commissionBank,
    commissionPolicy: values.commissionPolicy,
    commissionCqs: values.commissionCqs,
    commissionLoans: values.commissionLoans,
    loanAmount: values.loanAmount,
  });

  const revenue = useMemo(() => practiceRevenue(live), [live]);
  const payout = useMemo(
    () => collaboratorPayout(revenue, activeBrokerSharePercent),
    [revenue, activeBrokerSharePercent],
  );
  const overridePayout = useMemo(
    () =>
      showOverride && overrideSharePercent
        ? collaboratorPayout(revenue, overrideSharePercent)
        : 0,
    [revenue, showOverride, overrideSharePercent],
  );
  const onLoan = useMemo(
    () => revenueOnLoanPercent(revenue, live.loanAmount),
    [revenue, live.loanAmount],
  );

  function onEuroChange(
    key: keyof typeof live,
    raw: string,
  ) {
    const n = parseEuroExpression(raw);
    setLive((prev) => ({
      ...prev,
      [key]: n,
    }));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await updatePracticeEconomicsAction(applicationId, fd);
          if (res && "error" in res && res.error) {
            toast.error(res.error);
            return;
          }
          toast.success("Dati economici salvati");
          router.refresh();
        });
      }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Anagrafica
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">Nome cliente</Label>
            <Input
              id="clientName"
              name="clientName"
              defaultValue={values.clientName}
              className="h-10"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientEmail">Email cliente (opzionale)</Label>
            <Input
              id="clientEmail"
              name="clientEmail"
              type="email"
              defaultValue={
                values.clientEmail?.endsWith("@prontopratica.local")
                  ? ""
                  : values.clientEmail
              }
              placeholder="cliente@email.com"
              className="h-10"
            />
            <p className="text-[11px] text-slate-500">
              Non obbligatoria. Compilala qui quando la conosci: in elenco
              compare solo se impostata. I documenti da mail si agganciano per
              codice fiscale, non per mittente.
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Operazione e provenienza
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="provenance">Provenienza</Label>
            <input
              id="provenance"
              name="provenance"
              list="provenance-list"
              defaultValue={values.provenance ?? ""}
              placeholder="Es. TECNOCASA…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            />
            <datalist id="provenance-list">
              {provenanceOptions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankName">Banca</Label>
            <Input
              id="bankName"
              name="bankName"
              defaultValue={values.bankName ?? ""}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="operationType">Operazione</Label>
            <select
              id="operationType"
              name="operationType"
              defaultValue={values.operationType ?? "MUTUO"}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              {OPERATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Per solo CQS / prestito lascia mutuo vuoto: il fatturato usa
              comunque polizza/CQS/prestiti.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Cellulare</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={values.phone ?? ""}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loanAmount">Mutuo (€)</Label>
            <Input
              id="loanAmount"
              name="loanAmount"
              inputMode="decimal"
              defaultValue={numStr(values.loanAmount)}
              onChange={(e) => onEuroChange("loanAmount", e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="propertyAmount">Casa (€)</Label>
            <Input
              id="propertyAmount"
              name="propertyAmount"
              inputMode="decimal"
              defaultValue={numStr(values.propertyAmount)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ltvPercent">% LTV</Label>
            <Input
              id="ltvPercent"
              name="ltvPercent"
              inputMode="decimal"
              defaultValue={numStr(values.ltvPercent)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rogitoAt">Data rogito</Label>
            <Input
              id="rogitoAt"
              name="rogitoAt"
              type="date"
              defaultValue={toDateInput(values.rogitoAt)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notaryName">Notaio</Label>
            <Input
              id="notaryName"
              name="notaryName"
              defaultValue={values.notaryName ?? ""}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appraiserName">Perito</Label>
            <Input
              id="appraiserName"
              name="appraiserName"
              defaultValue={values.appraiserName ?? ""}
              className="h-10"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Provvigioni (€) — a mano
          </p>
          {/* Quota broker selector with 100% option */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-slate-600">Quota broker:</span>
            <button
              type="button"
              onClick={() => setShareMode("standard")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                shareMode === "standard"
                  ? "bg-primary-600 text-white shadow-xs"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Standard ({(collaboratorSharePercent * 100).toFixed(0)}%)
            </button>
            <button
              type="button"
              onClick={() => setShareMode("100")}
              className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                shareMode === "100"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
              title="100% senza split terzi / nessuna fattura terzi"
            >
              100% Broker (No split)
            </button>
            <button
              type="button"
              onClick={() => setShareMode("custom")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                shareMode === "custom"
                  ? "bg-primary-600 text-white shadow-xs"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Custom %
            </button>
            {shareMode === "custom" && (
              <div className="flex items-center gap-1">
                <Input
                  value={customShare}
                  onChange={(e) => setCustomShare(e.target.value)}
                  className="h-7 w-14 text-center text-xs"
                  type="number"
                  min="0"
                  max="100"
                />
                <span className="text-xs font-medium text-slate-600">%</span>
              </div>
            )}
            <input
              type="hidden"
              name="brokerSharePercent"
              value={activeBrokerSharePercent.toString()}
            />
          </div>
        </div>

        <p className="mt-1 text-xs text-slate-500">
          Fatturato = (Polizza ÷ 2) + CQS + Banca + Cliente + Prestiti. Quota
          broker effettiva: {(activeBrokerSharePercent * 100).toFixed(0)}%.
          {shareMode === "100" ? (
            <span className="ml-1 font-medium text-emerald-700">
              Pratica eseguita al 100% per intero (senza fattura né ripartizione terzi).
            </span>
          ) : null}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["commissionClient", "Cliente", "commissionClient"],
              ["commissionBank", "Banca", "commissionBank"],
              ["commissionPolicy", "Polizza", "commissionPolicy"],
              ["commissionCqs", "CQS", "commissionCqs"],
              ["commissionLoans", "Prestiti", "commissionLoans"],
              ["commissionNotary", "Notaio (extra)", null],
            ] as const
          ).map(([name, label, liveKey]) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={name}>{label}</Label>
              <Input
                id={name}
                name={name}
                inputMode="decimal"
                defaultValue={numStr(
                  values[name as keyof EconomicsValues] as number | null,
                )}
                onChange={
                  liveKey
                    ? (e) => onEuroChange(liveKey, e.target.value)
                    : undefined
                }
                className="h-10"
              />
            </div>
          ))}
        </div>

        <div
          className={`mt-4 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 ${
            showOverride ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
          }`}
        >
          <div>
            <p className="text-xs font-medium text-emerald-800">Fatturato</p>
            <p className="text-lg font-bold text-emerald-950">
              {formatEuro(revenue)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-800">
              Quota broker ({(activeBrokerSharePercent * 100).toFixed(0)}%)
              {shareMode === "100" ? " · 100% intero" : ""}
            </p>
            <p className="text-lg font-bold text-emerald-950">
              {formatEuro(payout)}
            </p>
          </div>
          {showOverride && overrideSharePercent ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-medium text-amber-900">
                Tua partecipazione riservata (
                {(overrideSharePercent * 100).toFixed(0)}%)
              </p>
              <p className="text-lg font-bold text-amber-950">
                {formatEuro(overridePayout)}
              </p>
              <p className="mt-0.5 text-[10px] text-amber-800">
                Visibile solo a te: il broker titolare non la vede
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-medium text-emerald-800">% su mutuo</p>
            <p className="text-lg font-bold text-emerald-950">
              {onLoan == null ? "n.d." : `${onLoan.toFixed(2)}%`}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Audit conformità
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {AUDIT_FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                name={f.key}
                defaultChecked={Boolean(values[f.key])}
                className="size-4 rounded border-slate-300"
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="economicNotes">Note economiche</Label>
        <textarea
          id="economicNotes"
          name="economicNotes"
          rows={3}
          defaultValue={values.economicNotes ?? ""}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="min-h-10 bg-primary-600 font-semibold hover:bg-primary-700"
      >
        {pending ? "Salvataggio…" : "Salva dati economici"}
      </Button>
    </form>
  );
}
