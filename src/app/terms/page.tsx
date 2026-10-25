import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export const metadata = {
  title: `Termini di servizio · ${APP_NAME}`,
  description: `Termini di servizio di ${APP_NAME}`,
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {APP_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Termini di servizio
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Ultimo aggiornamento: 25 ottobre 2026
        </p>
        <p className="mt-2 font-medium text-slate-700">
          Gestione pratiche mutuo
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              1. Accettazione e Accesso
            </h2>
            <p>
              L&apos;accesso e l&apos;uso di Prontopratica sono riservati esclusivamente agli operatori autorizzati della filiale e implicano la totale accettazione dei presenti termini.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              2. Servizio e Funzionalità Assistite da AI
            </h2>
            <p>
              Prontopratica fornisce strumenti software per organizzare le pratiche mutuo, archiviare file ed estrarre dati reddituali mediante intelligenza artificiale.
            </p>
            <p>
              L&apos;applicazione costituisce un mero strumento tecnico di ausilio e non sostituisce in alcun modo l&apos;obbligo di verifica professionale del mediatore creditizio. L&apos;operatore umano è tenuto a controllare l&apos;esattezza di tutti i dati estratti prima di inviarli agli istituti bancari o alla segreteria.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              3. Account e Misure di Sicurezza
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Gli operatori devono accedere tramite account Google Workspace verificato e mantenere riservate le proprie sessioni.
              </li>
              <li>
                L&apos;accesso al sistema è protetto da whitelist lato server: qualsiasi tentativo di accesso con credenziali non preventivamente autorizzate sarà respinto.
              </li>
              <li>
                I link generati per la trasmissione dei documenti alla segreteria hanno una validità limitata a 7 giorni.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              4. Limitazione di Responsabilità
            </h2>
            <p>
              Il software è fornito a supporto delle attività operative interne. Nei limiti consentiti dalla legge, il fornitore tecnico non risponde di eventuali imprecisioni nelle analisi automatiche AI, di ritardi nell&apos;istruttoria o di mancate concessioni di credito da parte degli istituti finanziari. L&apos;operatore si assume la piena responsabilità della verifica finale dei dati e della conformità della documentazione inoltrata.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              5. Sospensione e Modifiche
            </h2>
            <p>
              L&apos;accesso può essere revocato in caso di violazione dei presenti termini o su istruzione dei titolari dell&apos;ufficio. I termini possono essere aggiornati; la data in alto attesta l&apos;ultima revisione.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              6. Contatti
            </h2>
            <p>
              Per supporto o segnalazioni tecniche:{" "}
              <a className="text-primary-700 underline" href="mailto:aiorchestratoor@gmail.com">
                aiorchestratoor@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-10 border-t border-slate-100 pt-6 text-sm text-slate-500">
          <Link href="/privacy" className="text-primary-700 underline">
            Informativa sulla privacy
          </Link>
          {" · "}
          <Link href="/dashboard" className="text-primary-700 underline">
            Torna alla dashboard
          </Link>
        </p>
      </article>
    </div>
  );
}
