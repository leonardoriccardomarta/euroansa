import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export const metadata = {
  title: `Informativa sulla privacy · ${APP_NAME}`,
  description: `Informativa privacy di ${APP_NAME}`,
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {APP_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Informativa sulla privacy
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
              1. Ruoli del Trattamento
            </h2>
            <p>
              La presente piattaforma è uno strumento gestionale tecnico a uso interno e riservato, destinato agli operatori autorizzati della filiale per l&apos;istruttoria delle pratiche di credito.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Titolari del Trattamento:</strong> I titolari del trattamento dei dati dei clienti finali sono i professionisti / mediatori creditizi della filiale che raccolgono la documentazione e gestiscono il rapporto contrattuale.
              </li>
              <li>
                <strong>Responsabile del Trattamento (Fornitore Tecnico):</strong> Lo sviluppatore/gestore tecnico dell&apos;infrastruttura software agisce esclusivamente quale Responsabile del Trattamento (ex art. 28 GDPR) su istruzione documentata dei Titolari.
              </li>
            </ul>
            <p>
              Per comunicazioni tecniche o privacy:{" "}
              <a className="text-primary-700 underline" href="mailto:aiorchestratoor@gmail.com">
                aiorchestratoor@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              2. Finalità del Servizio
            </h2>
            <p>
              Prontopratica è un software di ausilio tecnico per mediatori creditizi: ricezione, archiviazione protetta e organizzazione documentale, estrazione assistita dei parametri di calcolo reddituale, checklist operative e condivisione sicura dei fascicoli con la segreteria.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              3. Dati trattati
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Dati degli account operatori:</strong> email Google Workspace aziendale, nominativo, identificativo di sessione tecnico.
              </li>
              <li>
                <strong>Dati delle pratiche e dei clienti finali:</strong> dati anagrafici, codici fiscali, documenti d&apos;identità, buste paga, certificazioni uniche (CU), modelli 730/Unico ed estratti conto bancari, preventivamente acquisiti dai Titolari con idoneo consenso e informativa privacy.
              </li>
              <li>
                <strong>Contenuti della casella Gmail di ufficio:</strong> messaggi e allegati pertinenti alle pratiche, limitatamente a quanto autorizzato via Google OAuth.
              </li>
              <li>
                <strong>Log tecnici di sicurezza:</strong> registri di accesso per finalità di auditing e protezione informatica.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              4. Integrazione Google (Gmail) e Informativa &quot;Limited Use&quot;
            </h2>
            <p>
              L&apos;accesso alla casella di posta dell&apos;ufficio via Google OAuth avviene unicamente per:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Individuare e acquisire gli allegati documentali pertinenti all&apos;istruttoria.</li>
              <li>Inviare notifiche e pacchetti documentali alla segreteria.</li>
              <li>Aggiornare lo stato di elaborazione tramite etichette email.</li>
            </ul>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">
                Dichiarazione d&apos;uso limitato Google:
              </p>
              <p className="mt-1">
                L&apos;uso e il trasferimento ad altre app di informazioni ricevute dalle API di Google da parte di Prontopratica sono rigorosamente conformi alle norme{" "}
                <a
                  className="text-primary-700 underline"
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , compresi i requisiti di Uso Limitato (Limited Use).
              </p>
              <p className="mt-2">
                I dati della casella Gmail non vengono mai venduti, non vengono utilizzati per annunci pubblicitari e non vengono condivisi con terzi per finalità estranee al funzionamento tecnico del servizio.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              5. Destinatari, Infrastruttura e Modelli AI
            </h2>
            <p>
              I dati transitano e risiedono su infrastrutture tecniche sicure e circoscritte:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Archiviazione Documenti:</strong> Storage protetto su Cloudflare R2 con allocazione dati all&apos;interno della giurisdizione dell&apos;Unione Europea (UE). L&apos;accesso ai documenti avviene tramite link temporanei firmati e protetti.
              </li>
              <li>
                <strong>Elaborazione AI:</strong> L&apos;estrazione documentale avviene tramite chiamate API a pagamento su Google Cloud (Gemini API) con divieto contrattuale di ritenzione dei dati e divieto di riutilizzo per l&apos;addestramento dei modelli.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              6. Condivisione e Conservazione dei Dati
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Condivisione sicura:</strong> I pacchetti trasmessi alla segreteria sono accessibili esclusivamente tramite link crittografati con scadenza prefissata a 7 giorni.
              </li>
              <li>
                <strong>Conservazione:</strong> I file restano memorizzati per il tempo strettamente necessario all&apos;istruttoria. Gli operatori autorizzati possono selezionare ed eliminare manualmente la documentazione al completamento della pratica.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              7. Diritti dell&apos;Interessato
            </h2>
            <p>
              Gli interessati possono esercitare i diritti previsti dal Regolamento UE 2016/679 (accesso, rettifica, cancellazione, limitazione) rivolgendosi ai Titolari del Trattamento (la filiale) o al supporto tecnico all&apos;indirizzo{" "}
              <a className="text-primary-700 underline" href="mailto:aiorchestratoor@gmail.com">
                aiorchestratoor@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              8. Revoca dell&apos;Accesso Google
            </h2>
            <p>
              L&apos;amministratore può revocare in qualsiasi momento i permessi concessi a Prontopratica dalla console dell&apos;applicazione o tramite la pagina di gestione autorizzazioni del proprio account Google.
            </p>
          </section>
        </div>

        <p className="mt-10 border-t border-slate-100 pt-6 text-sm text-slate-500">
          <Link href="/terms" className="text-primary-700 underline">
            Termini di servizio
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
