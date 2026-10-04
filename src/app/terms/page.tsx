import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export const metadata = {
  title: `Termini di servizio — ${APP_NAME}`,
  description: `Termini di servizio di ${APP_NAME}`,
};

export default function TermsPage() {
  const contact =
    process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "privacy@prontopratica.local";
  const updated = "4 ottobre 2026";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {APP_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Termini di servizio
        </h1>
        <p className="mt-2 text-sm text-slate-500">Ultimo aggiornamento: {updated}</p>
        <p className="mt-4 text-sm text-slate-600">{APP_TAGLINE}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Accettazione</h2>
            <p>
              Accedendo a {APP_NAME} accetti questi termini. L&apos;uso è
              riservato agli operatori autorizzati dall&apos;organizzazione che
              gestisce l&apos;istanza.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Servizio</h2>
            <p>
              {APP_NAME} fornisce strumenti per gestire pratiche mutuo:
              ricezione documenti, organizzazione file, supporto all&apos;analisi,
              checklist e comunicazione con la segreteria. Non è un servizio
              bancario né sostituisce obblighi professionali del mediatore.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              3. Account e responsabilità
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Conserva le credenziali in modo sicuro</li>
              <li>
                Usa l&apos;app solo per finalità professionali legittime
              </li>
              <li>
                Sei responsabile dei documenti e dei dati che carichi o fai
                elaborare
              </li>
              <li>
                Non tentare accessi non autorizzati né uso abusivo delle API
                Google collegate
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              4. Integrazione Google
            </h2>
            <p>
              L&apos;uso di Gmail tramite OAuth è soggetto anche ai termini di
              Google. L&apos;accesso alla casella ufficio è gestito
              dall&apos;amministratore e può essere revocato in qualsiasi
              momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              5. Disponibilità
            </h2>
            <p>
              Il servizio è fornito &quot;così com&apos;è&quot;. Possibili
              interruzioni per manutenzione, limiti dei fornitori cloud o errori
              di terzi (es. Google, hosting). Non si garantisce assenza di
              interruzioni.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              6. Limitazione di responsabilità
            </h2>
            <p>
              Nei limiti consentiti dalla legge, il fornitore dell&apos;istanza
              non risponde di danni indiretti, perdita di dati non imputabile a
              dolo o colpa grave, o decisioni creditizie basate sull&apos;uso
              dell&apos;app. L&apos;analisi assistita è di supporto e va
              verificata dall&apos;operatore.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Sospensione</h2>
            <p>
              L&apos;accesso può essere sospeso in caso di violazione dei
              termini, rischi di sicurezza o richiesta dell&apos;organizzazione
              cliente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              8. Modifiche
            </h2>
            <p>
              Questi termini possono essere aggiornati. La data in alto indica
              l&apos;ultima revisione. L&apos;uso continuato dopo la
              pubblicazione costituisce accettazione delle modifiche.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">9. Contatti</h2>
            <p>
              Per domande sui termini:{" "}
              <a className="text-primary-700 underline" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-10 text-sm">
          <Link href="/privacy" className="text-primary-700 underline">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/login" className="text-primary-700 underline">
            Accedi
          </Link>
        </p>
      </article>
    </div>
  );
}
