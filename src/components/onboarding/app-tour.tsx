"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Mail,
  Sparkles,
  Users,
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
  /** Ancora opzionale (data-tour) da evidenziare */
  anchor?: string;
  /** Percorso consigliato */
  path?: string;
  /** CTA secondaria: apre pratica demo */
  openDemo?: boolean;
};

function stepsForRole(isAdmin: boolean): TourStep[] {
  const commonStart: TourStep[] = [
    {
      id: "welcome",
      title: `Benvenuto in ${APP_NAME}`,
      body: isAdmin
        ? "Questa guida interattiva ti mostra il CRM delle pratiche mutuo: dalla casella Gmail di ufficio all’invio in segreteria. Ci vuole pochi minuti."
        : "Sei un broker: vedi solo le pratiche assegnate a te. Questa guida ti spiega checklist, documenti, relazione e invio in segreteria.",
    },
    {
      id: "roles",
      title: isAdmin ? "Il tuo ruolo: Admin" : "Il tuo ruolo: Broker",
      body: isAdmin
        ? "Come admin gestisci tutto: utenti broker, Impostazioni (Gmail ufficio), tutte le pratiche e l’assegnazione. I broker vedono solo le proprie."
        : "Non vedi le pratiche degli altri né Impostazioni/Utenti. Quando un admin ti assegna una pratica, ricevi una email con il link.",
      anchor: isAdmin ? "nav-users" : "nav-pratiche",
      path: "/dashboard",
    },
  ];

  const adminOnly: TourStep[] = [
    {
      id: "users",
      title: "Crea i broker",
      body: "In Utenti crei le credenziali dei colleghi. Solo l’admin collega Google (una casella ufficio per tutti).",
      anchor: "nav-users",
      path: "/dashboard/users",
    },
    {
      id: "settings",
      title: "Impostazioni e Gmail",
      body: "Qui colleghi la Gmail di ufficio e l’email di segreteria. Le nuove richieste arrivano dalle mail con il tag oggetto configurato.",
      anchor: "nav-settings",
      path: "/dashboard/settings",
    },
    {
      id: "assign",
      title: "Assegna al broker",
      body: "Su ogni card pratica (o nel dettaglio) scegli il broker. Al salvataggio parte un’email di notifica con il link alla pratica.",
      anchor: "tour-broker-assign",
      path: "/dashboard",
    },
  ];

  const flow: TourStep[] = [
    {
      id: "pratiche",
      title: "Elenco pratiche",
      body: "Qui trovi tutte le pratiche (admin) o solo le tue (broker). Filtra per stato: documenti incompleti, da inoltrare, in segreteria, fino a Rogitata.",
      anchor: "nav-pratiche",
      path: "/dashboard",
    },
    {
      id: "files",
      title: "File e cartelle",
      body: "In File puoi creare una cartella cliente a mano (senza email). Serve per pratiche già avviate o per caricare documenti offline. Prova anche la pratica Guida.",
      anchor: "tour-create-folder",
      path: "/dashboard/files",
      openDemo: true,
    },
    {
      id: "demo",
      title: "Pratica Guida (demo)",
      body: "Abbiamo preparato «Guida — Cliente Demo»: checklist già impostata, cartelle pronte, stato Documenti incompleti. Aprila e esplora senza rischi.",
      openDemo: true,
      path: "/dashboard",
    },
    {
      id: "checklist",
      title: "Checklist documenti",
      body: "Nel dettaglio pratica scegli i documenti richiesti per quella banca. La barra di avanzamento si aggiorna quando carichi PDF validi (l’AI li classifica).",
      anchor: "tour-checklist",
      openDemo: true,
    },
    {
      id: "upload",
      title: "Carica documenti",
      body: "Trascina o seleziona i PDF. Vengono salvati nello storage del sito, analizzati e rinominati. Se manca qualcosa, la pratica resta incompleta.",
      anchor: "tour-upload",
      openDemo: true,
    },
    {
      id: "relazione",
      title: "Relazione broker",
      body: "Prima dell’invio serve la relazione (PDF). Senza relazione non puoi mandare il pacchetto in segreteria.",
      anchor: "tour-relazione",
      openDemo: true,
    },
    {
      id: "send",
      title: "Invio in segreteria",
      body: "Quando checklist e relazione sono ok, invii il pacchetto: la segreteria riceve un link (valido 7 giorni). Se l’invio fallisce, il broker titolare riceve una mail di alert.",
      anchor: "tour-actions",
      openDemo: true,
    },
    {
      id: "notify",
      title: "Notifiche email",
      body: "Due casi principali: 1) assegnazione pratica → mail al broker; 2) fallimento invio segreteria → mail al broker (o all’admin). Non arrivano mail per ogni upload.",
      path: "/dashboard",
    },
    {
      id: "done",
      title: "Sei pronto",
      body: isAdmin
        ? "Rivedi la guida quando vuoi dal pulsante Guida in alto. La pratica demo resta in elenco (badge Test/Guida) e puoi cancellarla dopo."
        : "Rivedi la guida dal pulsante Guida. La pratica «Guida — Cliente Demo» è tua: usala per esercitarti, poi lavoraci sulle pratiche reali.",
    },
  ];

  return isAdmin
    ? [...commonStart, ...adminOnly, ...flow]
    : [...commonStart, ...flow];
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

  const openDemo = useCallback(() => {
    startTransition(async () => {
      const res = await ensureTutorialPracticeAction();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.ok && res.applicationId) {
        toast.success("Pratica Guida pronta");
        router.push(`/dashboard/applications/${res.applicationId}`);
        router.refresh();
      }
    });
  }, [router]);

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    const next = steps[index + 1];
    setIndex((i) => Math.min(i + 1, steps.length - 1));
    if (!next) return;

    if (next.openDemo && next.anchor?.startsWith("tour-")) {
      startTransition(async () => {
        const res = await ensureTutorialPracticeAction();
        if (res.ok && res.applicationId) {
          router.push(`/dashboard/applications/${res.applicationId}`);
          router.refresh();
        } else if (next.path && next.path !== pathname) {
          router.push(next.path);
        }
      });
      return;
    }

    if (next.path && next.path !== pathname) {
      router.push(next.path);
    }
  }, [finish, index, isLast, pathname, router, steps]);

  const goPrev = useCallback(() => {
    const prev = steps[index - 1];
    if (prev?.path && prev.path !== pathname) {
      router.push(prev.path);
    }
    setIndex((i) => Math.max(i - 1, 0));
  }, [index, pathname, router, steps]);

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
      <div className="fixed inset-0 z-[60] bg-slate-900/55" aria-hidden />

      {highlight ? (
        <div
          className="pointer-events-none fixed z-[65] rounded-xl ring-4 ring-primary-400 ring-offset-2 ring-offset-slate-900/40 transition-all"
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
        aria-modal="true"
        aria-labelledby="tour-title"
        className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-8 sm:right-8 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
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
        <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-[0.95rem]">
          {step.body}
        </p>

        {step.id === "roles" || step.id === "notify" ? (
          <ul className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
            {isAdmin ? (
              <>
                <li className="flex gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                  Admin: tutte le pratiche + assegna broker
                </li>
                <li className="flex gap-2">
                  <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                  Broker: solo pratiche proprie
                </li>
                <li className="flex gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                  Notifica email all’assegnazione
                </li>
              </>
            ) : (
              <>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                  Solo pratiche assegnate a te
                </li>
                <li className="flex gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                  Email quando ti assegnano una pratica
                </li>
              </>
            )}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {step.openDemo ? (
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
              onClick={goNext}
              className={cn("min-h-10 bg-primary-600 hover:bg-primary-700")}
            >
              {isLast ? "Fine" : "Avanti"}
              {!isLast ? <ChevronRight className="h-4 w-4" /> : null}
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
