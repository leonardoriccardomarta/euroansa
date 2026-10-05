import { Info } from "lucide-react";

/** Banner fisso sulla pratica Guida: spiega demo vs produzione. */
export function TutorialPracticeBanner() {
  return (
    <div
      data-tour="tour-demo-banner"
      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 shadow-sm"
    >
      <div className="flex gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <div className="space-y-1.5">
          <p className="font-semibold">Pratica di prova (Guida)</p>
          <p>
            Qui la checklist è incompleta{" "}
            <span className="font-medium">di proposito</span>, senza PDF
            caricati: serve a mostrarti schermate e pulsanti.
          </p>
          <p>
            <span className="font-medium">In produzione</span> la pratica nasce
            dalla mail di ufficio: cartelle e documenti arrivano in automatico
            (AI). Tu sistema i pezzi mancanti, carichi la relazione e invii in
            segreteria.
          </p>
        </div>
      </div>
    </div>
  );
}
