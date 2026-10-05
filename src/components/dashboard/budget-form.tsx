"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateBudgetTargetsAction } from "@/actions/crm";
import type { BudgetTargets } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function BudgetForm({
  targets,
  year,
}: {
  targets: BudgetTargets;
  year: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const fields: Array<{
    key: keyof BudgetTargets;
    label: string;
  }> = [
    { key: "mutui", label: "Mutui" },
    { key: "cqs", label: "CQS" },
    { key: "polizze", label: "Polizze" },
    { key: "prestiti", label: "Prestiti" },
  ];

  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await updateBudgetTargetsAction(fd);
          if (res && "error" in res && res.error) {
            toast.error(String(res.error));
            return;
          }
          toast.success("Target budget salvati");
          router.refresh();
        });
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Modifica target (admin)
      </p>
      <div className="max-w-xs space-y-1">
        <Label>Anno</Label>
        <Input name="budgetYear" defaultValue={year} className="h-10" />
      </div>
      {fields.map((f) => (
        <div
          key={f.key}
          className="grid gap-2 rounded-lg border border-slate-100 p-3 sm:grid-cols-4"
        >
          <p className="font-semibold text-slate-800 sm:col-span-4">{f.label}</p>
          <div className="space-y-1">
            <Label>Erogato €</Label>
            <Input
              name={`${f.key}Erogato`}
              defaultValue={targets[f.key].erogato}
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <Label>Pezzi</Label>
            <Input
              name={`${f.key}Pezzi`}
              defaultValue={targets[f.key].pezzi}
              className="h-10"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Aliquota % (es. 3)</Label>
            <Input
              name={`${f.key}Rate`}
              defaultValue={targets[f.key].rate * 100}
              className="h-10"
            />
          </div>
        </div>
      ))}
      <Button
        type="submit"
        disabled={pending}
        className="h-10 bg-primary-600 font-semibold"
      >
        Salva target
      </Button>
    </form>
  );
}
