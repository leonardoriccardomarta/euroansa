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

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Impostazioni</h1>
        <p className="mt-2 text-slate-600">
          Un solo Google collegato (mail/Drive ufficio). I broker non lo
          gestiscono.
        </p>
      </div>

      {params.google === "ok" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Google collegato. Eventuali altri OAuth admin sono stati scollegati
          (hub unico).
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
          Gmail + Drive ufficio
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
                  · {new Date(hub.googleConnectedAt).toLocaleString("it-IT")}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-slate-500">
              Hub gestito dall&apos;admin CRM{" "}
              <span className="font-medium">{hub?.email}</span>
              {connectedByMe ? " (tu)" : ""}. Solo questa casella viene letta;
              non collegare una seconda mail diversa a meno che non sia
              intenzionale (Ricollega sostituisce l&apos;hub).
            </p>
            <p className="text-xs text-slate-500">
              Tag oggetto:{" "}
              <code className="rounded bg-slate-100 px-1">
                {process.env.GMAIL_SUBJECT_TAG ?? "[EUROANSA-MUTUO]"}
              </code>
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/google/connect">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg"
                >
                  {connectedByMe ? "Ricollega Google" : "Prendi hub Google"}
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
              Nessun hub collegato. Autorizza la Gmail/Drive{" "}
              <strong>ufficio</strong> (una sola).
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
              Nome broker / agenzia
            </Label>
            <Input
              id="brokerName"
              name="brokerName"
              defaultValue={settings?.brokerName ?? "Euroansa"}
              required
              className="h-10 rounded-lg"
            />
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
