import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { updateSettingsAction } from "@/actions/applications";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");

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
          Destinatario pratiche complete e invio automatico
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Configurazione
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
