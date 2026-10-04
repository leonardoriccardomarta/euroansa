import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export const metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
  description: `Informativa privacy di ${APP_NAME}`,
};

export default function PrivacyPage() {
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
          Informativa sulla privacy
        </h1>
        <p className="mt-2 text-sm text-slate-500">Ultimo aggiornamento: {updated}</p>
        <p className="mt-4 text-sm text-slate-600">{APP_TAGLINE}</p>

        <div className="prose prose-slate mt-8 max-w-none space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Titolare</h2>
            <p>
              Il titolare del trattamento dei dati relativi all&apos;uso di{" "}
              {APP_NAME} è l&apos;organizzazione che gestisce l&apos;istanza
              dell&apos;applicazione (di seguito &quot;Titolare&quot;). Per
              richieste privacy:{" "}
              <a className="text-primary-700 underline" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              2. Cosa fa l&apos;app
            </h2>
            <p>
              {APP_NAME} è uno strumento interno per mediatori creditizi / agenzie
              mutui: ricezione e organizzazione documenti pratiche, analisi
              assistita, gestione checklist e invio pacchetti alla segreteria.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              3. Dati trattati
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Dati di account operatori (email, nome, ruolo, credenziali hash)
              </li>
              <li>
                Dati delle pratiche e dei clienti forniti via email o caricati
                dagli operatori (anagrafiche, documenti, metadati estratti)
              </li>
              <li>
                Contenuti della casella Gmail di ufficio collegata via Google
                OAuth, limitatamente a quanto necessario per individuare e
                gestire le pratiche (messaggi, allegati, invio email di
                servizio)
              </li>
              <li>Log tecnici di sicurezza e funzionamento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              4. Accesso Google (Gmail)
            </h2>
            <p>
              Se un amministratore collega Google, {APP_NAME} richiede
              autorizzazioni Gmail solo per:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>leggere le email rilevanti per le pratiche mutuo</li>
              <li>
                inviare email di servizio (es. link pacchetto a segreteria,
                notifiche interne)
              </li>
              <li>gestire etichette di elaborazione sulla casella ufficio</li>
            </ul>
            <p className="mt-2">
              Non vendiamo dati Google. Non usiamo i contenuti Gmail per
              pubblicità. L&apos;accesso è limitato alla casella di ufficio
              collegata dall&apos;admin e alle finalità sopra.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              5. Finalità e basi giuridiche
            </h2>
            <p>
              Trattamento per esecuzione del servizio richiesto
              dall&apos;organizzazione, legittimo interesse alla gestione
              operativa delle pratiche e, ove richiesto, adempimenti
              contrattuali / precontrattuali verso i clienti dell&apos;agenzia.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              6. Conservazione
            </h2>
            <p>
              I dati restano finché la pratica e l&apos;account sono necessari
              all&apos;attività, oppure fino a cancellazione da parte degli
              operatori autorizzati. I file possono essere rimossi dallo storage
              a pratica chiusa mantenendo eventuali metadati storici.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              7. Destinatari e fornitori
            </h2>
            <p>
              I dati possono essere trattati da fornitori tecnici che ospitano
              l&apos;app, il database e lo storage file, e da Google per le API
              Gmail. Non sono comunicati a terzi per finalità di marketing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Diritti</h2>
            <p>
              Gli interessati possono chiedere accesso, rettifica, cancellazione,
              limitazione, opposizione e portabilità nei limiti di legge,
              contattando {contact}. È possibile presentare reclamo
              all&apos;Autorità Garante per la protezione dei dati personali.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">
              9. Revoca Google
            </h2>
            <p>
              L&apos;admin può scollegare Google dalle Impostazioni
              dell&apos;app. È inoltre possibile revocare l&apos;accesso dalla
              pagina delle autorizzazioni Google dell&apos;account.
            </p>
          </section>
        </div>

        <p className="mt-10 text-sm">
          <Link href="/terms" className="text-primary-700 underline">
            Termini di servizio
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
