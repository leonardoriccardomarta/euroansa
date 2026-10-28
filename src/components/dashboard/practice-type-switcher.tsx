"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePracticeTypeAction } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Users2, User, Edit3 } from "lucide-react";
import { toast } from "sonner";

export function PracticeTypeSwitcher({
  applicationId,
  isCouple,
  clientName,
  clientFiscalCode,
  coApplicantName,
  coApplicantFiscalCode,
}: {
  applicationId: string;
  isCouple: boolean;
  clientName: string;
  clientFiscalCode: string | null;
  coApplicantName?: string | null;
  coApplicantFiscalCode?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [selectedType, setSelectedType] = useState<"Singola" | "Coppia">(
    isCouple ? "Coppia" : "Singola",
  );
  const [name1, setName1] = useState(clientName);
  const [cf1, setCf1] = useState(clientFiscalCode ?? "");
  const [name2, setName2] = useState(coApplicantName ?? "");
  const [cf2, setCf2] = useState(coApplicantFiscalCode ?? "");

  const handleOpen = () => {
    setSelectedType(isCouple ? "Coppia" : "Singola");
    setName1(clientName);
    setCf1(clientFiscalCode ?? "");
    setName2(coApplicantName ?? "");
    setCf2(coApplicantFiscalCode ?? "");
    setOpen(true);
  };

  const handleSave = () => {
    const isNowCouple = selectedType === "Coppia";
    startTransition(async () => {
      const res = await updatePracticeTypeAction(applicationId, {
        isCouple: isNowCouple,
        clientName: name1.trim(),
        clientFiscalCode: cf1.trim().toUpperCase() || null,
        coApplicantName: isNowCouple ? name2.trim() || null : null,
        coApplicantFiscalCode: isNowCouple
          ? cf2.trim().toUpperCase() || null
          : null,
      });

      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        isNowCouple
          ? "Pratica impostata come Coppia"
          : "Pratica impostata come Singola",
      );
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="group inline-flex items-center gap-1.5 focus:outline-none"
        title="Clicca per modificare tipo pratica (Singola / Coppia)"
      >
        <Badge
          variant="outline"
          className={
            isCouple
              ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 cursor-pointer transition-colors"
              : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
          }
        >
          {isCouple ? (
            <Users2 className="mr-1 h-3 w-3 inline-block" />
          ) : (
            <User className="mr-1 h-3 w-3 inline-block" />
          )}
          {isCouple ? "Coppia / cointestatari" : "Singola"}
          <Edit3 className="ml-1 h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Tipo Pratica</DialogTitle>
            <DialogDescription>
              Passa in qualunque momento tra pratica Singola o Coppia,
              aggiornando i richiedenti e l&apos;organizzazione cartelle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo Pratica
              </Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedType("Singola")}
                  className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition ${
                    selectedType === "Singola"
                      ? "border-primary-600 bg-primary-50 text-primary-700 shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <User className="h-4 w-4" />
                  Singola
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("Coppia")}
                  className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition ${
                    selectedType === "Coppia"
                      ? "border-primary-600 bg-primary-50 text-primary-700 shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Users2 className="h-4 w-4" />
                  Coppia
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-700">
                {selectedType === "Coppia"
                  ? "Richiedente 1 (Principale)"
                  : "Richiedente"}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="req1_name" className="text-xs">
                  Nome e cognome
                </Label>
                <Input
                  id="req1_name"
                  value={name1}
                  onChange={(e) => setName1(e.target.value)}
                  placeholder="Es. Mario Rossi"
                  className="h-9 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req1_cf" className="text-xs">
                  Codice Fiscale
                </Label>
                <Input
                  id="req1_cf"
                  value={cf1}
                  onChange={(e) => setCf1(e.target.value)}
                  placeholder="RSSMRA..."
                  maxLength={16}
                  className="h-9 bg-white uppercase font-mono text-xs"
                />
              </div>
            </div>

            {selectedType === "Coppia" ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-sky-900">
                  Richiedente 2 (Cointestatario)
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="req2_name" className="text-xs">
                    Nome e cognome
                  </Label>
                  <Input
                    id="req2_name"
                    value={name2}
                    onChange={(e) => setName2(e.target.value)}
                    placeholder="Es. Giulia Bianchi"
                    className="h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req2_cf" className="text-xs">
                    Codice Fiscale
                  </Label>
                  <Input
                    id="req2_cf"
                    value={cf2}
                    onChange={(e) => setCf2(e.target.value)}
                    placeholder="BNCGLI..."
                    maxLength={16}
                    className="h-9 bg-white uppercase font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}

            {selectedType === "Coppia" && !isCouple ? (
              <p className="text-xs text-sky-700">
                Attivando &quot;Coppia&quot;, verranno configurate
                automaticamente le cartelle radice per <strong>Richiedente 1</strong>,{" "}
                <strong>Richiedente 2</strong> e <strong>Immobile / Pratica</strong>.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Annulla
            </Button>
            <Button
              type="button"
              disabled={pending || !name1.trim()}
              onClick={handleSave}
              className="bg-primary-600 hover:bg-primary-700 font-semibold"
            >
              {pending ? "Salvataggio..." : "Salva modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
