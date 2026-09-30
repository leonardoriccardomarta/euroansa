import { eq } from "drizzle-orm";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { updateSettingsAction } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Impostazioni segreteria</h1>
        <p className="text-sm text-slate-600">
          Destinatario pratiche complete e invio automatico
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurazione</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateSettingsAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brokerName">Nome broker / agenzia</Label>
              <Input
                id="brokerName"
                name="brokerName"
                defaultValue={settings?.brokerName ?? "Euroansa"}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretaryEmail">Email segreteria</Label>
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
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="autoSendToSecretary"
                defaultChecked={settings?.autoSendToSecretary ?? true}
                className="size-4 rounded border-slate-300"
              />
              Invio automatico a segreteria quando la checklist è completa
            </label>
            <Button type="submit" className="bg-emerald-800 hover:bg-emerald-900">
              Salva
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
