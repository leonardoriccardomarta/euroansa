"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import {
  ensureTutorialPracticeAction,
  markTutorialCompleteAction,
  resetTutorialAction,
} from "@/actions/tutorial";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Box “in produzione vs demo” */
  callout?: string;
  anchor?: string;
  path?: string;
  /** Porta alla pratica Guida (dettaglio), non a File */
  goDemo?: boolean;
  /** Mostra CTA “Apri pratica Guida” */
  showDemoCta?: boolean;
  primaryLabel?: string;
};

function stepsForRole(isAdmin: boolean): TourStep[] {
  const start: TourStep[] = [
    {
      id: "welcome",
      title: `Come si lavora con ${APP_NAME}`,
      body: "Segui il percorso come in ufficio: arriva una mail cliente → si apre la pratica → il broker completa → si invia in segreteria. Questa guida ti accompagna passo passo.",
      path: "/dashboard",
    },
    {
      id: "auto",
      title: "1. Le pratiche nascono da sole",
      body: "Il cliente (o il broker) scrive alla Gmail di ufficio con il tag oggetto configurato e allega i PDF. Il sistema crea la pratica, le cartelle e classifica i documenti con l’AI. Non crei nulla a mano, di solito.",
      callout:
        "La pratica «Guida Cliente Demo» è vuota di proposito (0/9): è un banco prova. In produzione checklist e file si riempiono dalle email.",
      path: "/dashboard",
      showDemoCta: true,
    },
    {
      id: "pratiche",
      title: "2. Elenco Pratiche",
      body: isAdmin
        ? "Qui vedi tutte le pratiche. Filtra per stato (incompleti, da inoltrare, segreteria, rogitata…). Ogni card ha stato e, per te admin, il menu Broker."
        : "Qui vedi solo le pratiche assegnate a te. Le altre non compaiono: l’admin te le assegna quando tocca a te.",
      anchor: "nav-pratiche",
      path: "/dashboard",
    },
  ];

  const adminMiddle: TourStep[] = [
    {
      id: "assign",
      title: "3. Assegna il broker",
      body: "Sulla card (menu Broker) scegli il collega. Al salvataggio parte un’email con il link alla pratica. Il broker vede solo quella.",
      callout: "Provalo sulla card Guida: assegna un broker e poi togli l’assegnazione se era solo prova.",
      anchor: "tour-broker-assign",
      path: "/dashboard",
      showDemoCta: true,
    },
    {
      id: "users-settings",
      title: "Utenti e Impostazioni",
      body: "In Utenti crei i login dei broker. In Impostazioni colleghi la Gmail ufficio e l’email di segreteria. Solo l’admin fa queste due cose.",
      anchor: "nav-settings",
      path: "/dashboard/settings",
    },
  ];

  const brokerMiddle: TourStep[] = [
    {
      id: "notify",
      title: "3. Quando ti assegnano",
      body: "Ricevi un’email con il link. Apri Pratiche e lavori solo sulla tua. Se l’invio in segreteria fallisce, arriva un’altra mail di alert.",
      path: "/dashboard",
    },
  ];

  const practiceSteps: TourStep[] = [
    {
      id: "open-demo",
      title: "4. Apri la pratica Guida",
      body: "Ora entriamo nel dettaglio di una pratica finta. Serve a toccare checklist, upload e relazione senza rischiare dati reali.",
      callout:
        "Ricorda: incompleta = normale nella demo. Con le mail vere documenti e cartelle arrivano già, e tu sistematici i pezzi mancanti.",
      goDemo: true,
      showDemoCta: true,
      primaryLabel: "Apri e continua",
    },
    {
      id: "checklist",
      title: "Checklist documenti",
      body: "Qui segni cosa serve per quella banca. In produzione spesso parte già popolata o la regoli tu. La barra 0/9 della demo dice solo «mancano ancora i PDF».",
      callout: "Puoi togliere/aggiungere voci: è sicuro, è la pratica Guida.",
      anchor: "tour-checklist",
      goDemo: true,
    },
    {
      id: "upload",
      title: "Documenti mancanti",
      body: "Se manca qualcosa (o la mail non aveva tutti gli allegati), carichi qui i PDF. L’AI li legge, li rinomina e aggiorna la checklist.",
      callout:
        "Nella demo non ci sono file: prova a caricare un PDF qualsiasi, oppure vai avanti senza.",
      anchor: "tour-upload",
      goDemo: true,
    },
    {
      id: "relazione-send",
      title: "Relazione e invio segreteria",
      body: "Carichi la relazione PDF (obbligatoria), poi «Invia a segreteria». Parte un link pacchetto valido 7 giorni. Senza relazione il pulsante resta bloccato.",
      anchor: "tour-relazione",
      goDemo: true,
    },
    {
      id: "files-alt",
      title: "File = scorciatoia manuale",
      body: "La voce File non è il flusso principale. Serve se vuoi creare una cartella cliente a mano (senza mail) o navigare i PDF già salvati.",
      callout:
        "Non confonderla con «apri pratica»: la pratica si lavora da Pratiche → Apri. File è solo archivio / creazione cartella.",
      anchor: "tour-create-folder",
      path: "/dashboard/files",
    },
    {
      id: "done",
      title: "Fatto",
      body: isAdmin
        ? "Flusso reale: mail → pratica → assegna broker → checklist/relazione → segreteria. Riapri la guida dal pulsante Guida. Puoi cancellare la pratica demo quando vuoi."
        : "Flusso reale: ti assegnano → lavori documenti e relazione → invii in segreteria. Riapri la guida dal pulsante Guida.",
      path: "/dashboard",
      primaryLabel: "Ho capito",
    },
  ];

  return isAdmin
    ? [...start, ...adminMiddle, ...practiceSteps]
    : [...start, ...brokerMiddle, ...practiceSteps];
}

export function AppTour({
  isAdmin,
  tutorialDone,
}: {
  isAdmin: boolean;
  tutorialDone: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const forceOpen = searchParams.get("tour") === "1";

  const steps = useMemo(() => stepsForRole(isAdmin), [isAdmin]);
  const [open, setOpen] = useState(!tutorialDone || forceOpen);
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [highlight, setHighlight] = useState<DOMRect | null>(null);

  const step = steps[index]!;
  const isLast = index === steps.length - 1;
  const progress = ((index + 1) / steps.length) * 100;

  const finish = useCallback(() => {
    startTransition(async () => {
      await markTutorialCompleteAction();
      setOpen(false);
      const url = new URL(window.location.href);
      if (url.searchParams.has("tour")) {
        url.searchParams.delete("tour");
        router.replace(url.pathname + url.search);
      }
      router.refresh();
    });
  }, [router]);

  const ensureDemoAndGo = useCallback(() => {
    return new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const res = await ensureTutorialPracticeAction();
        if ("error" in res && res.error) {
          toast.error(res.error);
          resolve(null);
          return;
        }
        if (res.ok && res.applicationId) {
          router.push(`/dashboard/applications/${res.applicationId}`);
          router.refresh();
          resolve(res.applicationId);
          return;
        }
        resolve(null);
      });
    });
  }, [router]);

  const openDemo = useCallback(() => {
    void ensureDemoAndGo().then((id) => {
      if (id) toast.message("Pratica Guida è incompleta di proposito");
    });
  }, [ensureDemoAndGo]);

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    const next = steps[index + 1];
    setIndex((i) => Math.min(i + 1, steps.length - 1));
    if (!next) return;

    if (next.goDemo) {
      void ensureDemoAndGo();
      return;
    }
    if (next.path && next.path !== pathname) {
      router.push(next.path);
    }
  }, [ensureDemoAndGo, finish, index, isLast, pathname, router, steps]);

  const goPrev = useCallback(() => {
    const prev = steps[index - 1];
    setIndex((i) => Math.max(i - 1, 0));
    if (!prev) return;
    if (prev.goDemo) {
      void ensureDemoAndGo();
      return;
    }
    if (prev.path && prev.path !== pathname) {
      router.push(prev.path);
    }
  }, [ensureDemoAndGo, index, pathname, router, steps]);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setIndex(0);
    }
  }, [forceOpen]);

  useEffect(() => {
    if (!open || !step.anchor) {
      setHighlight(null);
      return;
    }
    const nodes = document.querySelectorAll<HTMLElement>(
      `[data-tour="${step.anchor}"]`,
    );
    let el: HTMLElement | null = null;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        el = node;
        break;
      }
    }
    if (!el) {
      setHighlight(null);
      return;
    }
    const update = () => setHighlight(el!.getBoundingClientRect());
    update();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step.anchor, pathname, index]);

  if (!open) {
    return (
      <button
        type="button"
        data-tour="tour-reopen"
        onClick={() => {
          startTransition(async () => {
            await resetTutorialAction();
            setIndex(0);
            setOpen(true);
            router.refresh();
          });
        }}
        className="fixed bottom-20 right-4 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-lg transition hover:bg-slate-50 active:scale-95 md:bottom-6"
        aria-label="Apri guida"
      >
        <BookOpen className="h-4 w-4 text-primary-600" />
        Guida
      </button>
    );
  }

  return (
    <>
      {/* Overlay non blocca i click: puoi usare l’app mentre leggi */}
      <div
        className="pointer-events-none fixed inset-0 z-[60] bg-slate-900/35"
        aria-hidden
      />

      {highlight ? (
        <div
          className="pointer-events-none fixed z-[65] rounded-xl ring-4 ring-primary-400 ring-offset-2 ring-offset-transparent transition-all"
          style={{
            top: highlight.top - 6,
            left: highlight.left - 6,
            width: highlight.width + 12,
            height: highlight.height + 12,
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-8 sm:right-8 sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-primary-700">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Guida · {index + 1}/{steps.length}
            </span>
          </div>
          <button
            type="button"
            onClick={finish}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Chiudi guida"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <h2
          id="tour-title"
          className="text-xl font-bold text-slate-900 sm:text-2xl"
        >
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {step.body}
        </p>

        {step.callout ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <p>{step.callout}</p>
          </div>
        ) : null}

        <p className="mt-3 text-xs text-slate-500">
          Puoi cliccare l’app dietro questa scheda mentre segui la guida.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {step.showDemoCta ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={openDemo}
              className="min-h-10"
            >
              Apri pratica Guida
            </Button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={index === 0 || pending}
              onClick={goPrev}
              className="min-h-10"
            >
              <ChevronLeft className="h-4 w-4" />
              Indietro
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                if (step.id === "open-demo") {
                  void ensureDemoAndGo().then(() => {
                    if (!isLast) setIndex((i) => i + 1);
                  });
                  return;
                }
                goNext();
              }}
              className={cn("min-h-10 bg-primary-600 hover:bg-primary-700")}
            >
              {step.primaryLabel ?? (isLast ? "Fine" : "Avanti")}
              {!isLast && !step.primaryLabel ? (
                <ChevronRight className="h-4 w-4" />
              ) : null}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={finish}
          className="mt-3 text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
        >
          Salta e non mostrare più
        </button>
      </div>
    </>
  );
}
