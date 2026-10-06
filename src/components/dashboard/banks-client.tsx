"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteBankPolicyAction,
  reseedBankPoliciesAction,
  upsertBankPolicyAction,
} from "@/actions/phase3";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Policy = {
  id: string;
  bankName: string;
  summary: string | null;
  rows: { label: string; value: string }[];
  detailText?: string | null;
  sortOrder: number;
};

export function BanksClient({
  rows,
  isAdmin,
}: {
  rows: Policy[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const [editMode, setEditMode] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.bankName.toLowerCase().includes(needle) ||
        (r.summary ?? "").toLowerCase().includes(needle) ||
        (r.detailText ?? "").toLowerCase().includes(needle) ||
        r.rows.some(
          (x) =>
            x.label.toLowerCase().includes(needle) ||
            x.value.toLowerCase().includes(needle),
        ),
    );
  }, [q, rows]);

  const selected =
    filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label>Cerca banca o regola</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="es. trasferte, CONSAP, ING…"
            className="h-10"
          />
        </div>
        {isAdmin ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => {
                setEditMode(true);
                setSelectedId("");
              }}
            >
              Nuova banca
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    "Sincronizzare tutte le banche dal foglio seed completo? Sovrascrive le schede già presenti (stesso slug).",
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const res = await reseedBankPoliciesAction();
                  if (res && "error" in res && res.error) {
                    toast.error(String(res.error));
                    return;
                  }
                  const inserted =
                    res && "inserted" in res ? res.inserted : 0;
                  const updated =
                    res && "updated" in res ? res.updated : 0;
                  toast.success(
                    `Scheda banche aggiornata (${updated} aggiornate, ${inserted} nuove)`,
                  );
                  router.refresh();
                });
              }}
            >
              Sync da seed
            </Button>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {filtered.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(b.id);
                  setEditMode(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  selected?.id === b.id && !editMode
                    ? "bg-primary-50 text-primary-800"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {b.bankName}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500">
              Nessun risultato
            </li>
          ) : null}
        </ul>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {editMode && isAdmin ? (
            <BankEditor
              initial={
                selectedId
                  ? rows.find((r) => r.id === selectedId) ?? null
                  : null
              }
              pending={pending}
              onCancel={() => setEditMode(false)}
              onSave={(fd) => {
                startTransition(async () => {
                  const res = await upsertBankPolicyAction(fd);
                  if (res && "error" in res && res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Banca salvata");
                  setEditMode(false);
                  router.refresh();
                });
              }}
            />
          ) : selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {selected.bankName}
                  </h2>
                  {selected.summary ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {selected.summary}
                    </p>
                  ) : null}
                </div>
                {isAdmin ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-9"
                      onClick={() => {
                        setSelectedId(selected.id);
                        setEditMode(true);
                      }}
                    >
                      Modifica
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-9 text-red-700"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Eliminare ${selected.bankName}?`)) return;
                        startTransition(async () => {
                          const res = await deleteBankPolicyAction(selected.id);
                          if (res && "error" in res && typeof res.error === "string") {
                            toast.error(res.error);
                            return;
                          }
                          toast.success("Eliminata");
                          router.refresh();
                        });
                      }}
                    >
                      Elimina
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto">
                {selected.rows.length > 0 ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Scheda rapida (matrice)
                    </h3>
                    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {selected.rows.map((row, idx) => (
                        <div
                          key={`${row.label}-${idx}`}
                          className="grid gap-1 px-3 py-2.5 sm:grid-cols-[220px_1fr]"
                        >
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {row.label}
                          </dt>
                          <dd className="text-sm whitespace-pre-wrap text-slate-800">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}
                {selected.detailText ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Policy completa (tab Excel)
                    </h3>
                    <pre className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 font-sans text-sm leading-relaxed text-slate-800">
                      {selected.detailText}
                    </pre>
                  </section>
                ) : null}
                {!selected.rows.length && !selected.detailText ? (
                  <p className="text-sm text-slate-500">Nessuna policy.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Seleziona una banca.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BankEditor({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial: Policy | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (fd: FormData) => void;
}) {
  const [rowsText, setRowsText] = useState(() =>
    (initial?.rows ?? [{ label: "Nota", value: "" }])
      .map((r) => `${r.label}|${r.value}`)
      .join("\n"),
  );
  const [detailText, setDetailText] = useState(initial?.detailText ?? "");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const rows = rowsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const i = line.indexOf("|");
            if (i < 0) return { label: line, value: "" };
            return {
              label: line.slice(0, i).trim(),
              value: line.slice(i + 1).trim(),
            };
          });
        fd.set("rowsJson", JSON.stringify(rows));
        fd.set("detailText", detailText);
        onSave(fd);
      }}
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="space-y-1">
        <Label>Nome banca</Label>
        <Input
          name="bankName"
          required
          defaultValue={initial?.bankName ?? ""}
          className="h-10"
        />
      </div>
      <div className="space-y-1">
        <Label>Summary</Label>
        <Input
          name="summary"
          defaultValue={initial?.summary ?? ""}
          className="h-10"
        />
      </div>
      <div className="space-y-1">
        <Label>Ordine</Label>
        <Input
          name="sortOrder"
          type="number"
          defaultValue={initial?.sortOrder ?? 0}
          className="h-10"
        />
      </div>
      <div className="space-y-1">
        <Label>Righe matrice (una per riga: Etichetta|Valore)</Label>
        <textarea
          value={rowsText}
          onChange={(e) => setRowsText(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label>Policy completa (tab Excel)</Label>
        <textarea
          value={detailText}
          onChange={(e) => setDetailText(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="bg-primary-600 hover:bg-primary-700"
        >
          Salva
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
