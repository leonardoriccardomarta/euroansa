import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { systemSettings, users } from "@/db/schema";
import { updateSettingsAction } from "@/actions/applications";
import { disconnectGoogleAction } from "@/actions/google";
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

  const params = await searchParams;

  const [me] = await db
    .select({
      googleEmail: users.googleEmail,
      googleConnectedAt: users.googleConnectedAt,
      googleRefreshToken: users.googleRefreshToken,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  const googleConnected = Boolean(me?.googleRefreshToken);

  const [settings] =
    session.role === "ADMIN"
      ? await db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.id, "global"))
          .limit(1)
      : [null];

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Impostazioni</h1>
        <p className="mt-2 text-slate-600">
          Collega la tua Gmail e Drive: le pratiche che arrivano sulla tua
          casella ti vengono assegnate e i file restano sul tuo Drive.
        </p>
      </div>

      {params.google === "ok" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Google collegato correttamente.
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
          Il mio Google
        </p>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Gmail + Drive
        </h2>
        {googleConnected ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Collegato come{" "}
              <span className="font-semibold">
                {me?.googleEmail ?? "account Google"}
              </span>
              {me?.googleConnectedAt ? (
                <span className="text-slate-500">
                  {" "}
                  ·{" "}
                  {new Date(me.googleConnectedAt).toLocaleString("it-IT")}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-slate-500">
              Login CRM: {session.email}. Le mail con oggetto{" "}
              <code className="rounded bg-slate-100 px-1">
                {process.env.GMAIL_SUBJECT_TAG ?? "[EUROANSA-MUTUO]"}
              </code>{" "}
              sulla casella collegata diventano pratiche tue.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/google/connect">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg"
                >
                  Ricollega Google
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
              Nessun account collegato. Autorizza Gmail (lettura/invio) e Drive
              (cartelle pratiche).
            </p>
            <a href="/api/google/connect">
              <Button
                type="button"
                className="h-10 rounded-lg bg-primary-600 font-semibold shadow-md hover:bg-primary-700"
              >
                Collega Google
              </Button>
            </a>
          </div>
        )}
      </div>

      {session.role === "ADMIN" ? (
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
      ) : null}
    </div>
  );
}
