import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { updateSettingsAction } from "@/actions/applications";
import { disconnectGoogleAction } from "@/actions/google";
import { getOfficeGoogleHub } from "@/lib/google/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_COLLABORATOR_SHARE,
  DEFAULT_PROVENANCE_OPTIONS,
} from "@/lib/economics";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; msg?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const hub = await getOfficeGoogleHub();
  const googleConnected = Boolean(hub?.googleRefreshToken);
  const connectedByMe = hub?.id === session.id;

  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  const sharePct = Math.round(
    (settings?.collaboratorSharePercent ?? DEFAULT_COLLABORATOR_SHARE) * 100,
  );
  const provenances =
    settings?.provenanceOptions?.length
      ? settings.provenanceOptions.join("\n")
      : DEFAULT_PROVENANCE_OPTIONS.join("\n");

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Impostazioni</h1>
        <p className="mt-2 text-slate-600">
          Collega la Gmail di ufficio e imposta i dati agenzia.
        </p>
      </div>

      {params.google === "ok" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Google collegato. Resta attiva solo questa casella di ufficio.
        </p>
      ) : null}
      {params.google === "denied" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Autorizzazione Google annullata.
        </p>
      ) : null}
      {params.google === "error" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Errore Google: {params.msg ?? "riprova"}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Google agenzia (uno solo)
        </p>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Gmail ufficio (lettura mail + invio segreteria)
        </h2>
        {googleConnected ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Collegato come{" "}
              <span className="font-semibold">
                {hub?.googleEmail ?? "account Google"}
              </span>
              {hub?.googleConnectedAt ? (
                <span className="text-slate-500">
                  {" "}
                  {new Date(hub.googleConnectedAt).toLocaleString("it-IT")}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-slate-500">
              Gestita da{" "}
              <span className="font-medium">{hub?.email}</span>
              {connectedByMe ? " (tu)" : ""}. Solo questa casella viene usata
              per leggere le mail, i link Drive degli allegati grandi e scrivere
              alla segreteria. Se hai collegato Google prima, usa Ricollega per
              aggiornare i permessi.
            </p>
            {process.env.GMAIL_SUBJECT_TAG ? (
              <p className="text-xs text-slate-500">
                Oggetto mail clienti:{" "}
                <code className="rounded bg-slate-100 px-1">
                  {process.env.GMAIL_SUBJECT_TAG}
                </code>
                {" · "}coppia/cointestatari:{" "}
                <code className="rounded bg-slate-100 px-1">
                  COPPIA EUROANSA MUTUO
                </code>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <a href="/api/google/connect">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg"
                >
                  {connectedByMe ? "Ricollega Google" : "Collega questa Google"}
                </Button>
              </a>
              <form action={disconnectGoogleAction}>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 rounded-lg border-red-200 text-red-700 hover:bg-red-50"
                >
                  Scollega
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Nessuna casella collegata. Autorizza la Gmail di{" "}
              <strong>ufficio</strong> (una sola) per leggere le mail clienti e
              inviare i pacchetti alla segreteria.
            </p>
            <a href="/api/google/connect">
              <Button
                type="button"
                className="h-10 rounded-lg bg-primary-600 font-semibold shadow-md hover:bg-primary-700"
              >
                Collega Google ufficio
              </Button>
            </a>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Configurazione agenzia
        </p>
        <form action={updateSettingsAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brokerName" className="font-semibold">
              Firma email di default
            </Label>
            <Input
              id="brokerName"
              name="brokerName"
              defaultValue={settings?.brokerName ?? "Broker"}
              required
              className="h-10 rounded-lg"
            />
            <p className="text-xs text-slate-500">
              Usata in firma se la pratica non ha un broker assegnato. Con
              broker assegnato la mail usa il suo nome profilo.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secretaryEmail" className="font-semibold">
              Email segreteria
            </Label>
            <Input
              id="secretaryEmail"
              name="secretaryEmail"
              type="email"
              defaultValue={
                settings?.secretaryEmail ??
                process.env.SECRETARY_EMAIL_DEFAULT ??
                ""
              }
              required
              className="h-10 rounded-lg"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="autoSendToSecretary"
              defaultChecked={settings?.autoSendToSecretary ?? true}
              className="size-4 rounded border-slate-300"
            />
            Invio automatico a segreteria quando la checklist è completa
          </label>
          <div className="space-y-2">
            <Label htmlFor="collaboratorSharePercent" className="font-semibold">
              Quota default nuovi broker (%)
            </Label>
            <Input
              id="collaboratorSharePercent"
              name="collaboratorSharePercent"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={sharePct}
              className="h-10 rounded-lg"
            />
            <p className="text-xs text-slate-500">
              Fallback se un utente non ha ancora la quota in Utenti. Le quote
              reali (Filip 50%, altro 30%, override 20%) si impostano in{" "}
              <strong>Utenti</strong>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provenanceOptions" className="font-semibold">
              Provenienze / agenzie (una per riga)
            </Label>
            <textarea
              id="provenanceOptions"
              name="provenanceOptions"
              rows={10}
              defaultValue={provenances}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">
              Comparono nella tendina Provenienza di ogni pratica.
            </p>
          </div>
          <Button
            type="submit"
            className="h-10 rounded-lg bg-primary-600 font-semibold shadow-md hover:bg-primary-700"
          >
            Salva
          </Button>
        </form>
      </div>
    </div>
  );
}
