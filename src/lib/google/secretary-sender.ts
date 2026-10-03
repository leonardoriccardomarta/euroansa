import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
  type GoogleOAuthClient,
} from "./auth";
import { sendGmailHtml } from "./gmail";

async function resolveAuthForApplication(
  brokerId: string | null,
): Promise<GoogleOAuthClient> {
  if (brokerId) {
    try {
      return await getGoogleAuthForUser(brokerId);
    } catch {
      // fall through
    }
  }
  const connected = await listConnectedGoogleUsers();
  if (connected[0]) {
    return oauthClientFromRefreshToken(connected[0].googleRefreshToken);
  }
  throw new Error(
    "Nessun Google collegato: Impostazioni → Collega Google (titolare pratica)",
  );
}

export async function sendApplicationToSecretary(applicationId: string) {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) throw new Error("Pratica non trovata");

  if (!app.relazioneStorageKey) {
    throw new Error(
      "Relazione mancante: carica la relazione PDF prima di inviare a segreteria",
    );
  }

  const auth = await resolveAuthForApplication(app.brokerId);

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  let [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  if (!settings) {
    settings = {
      id: "global",
      secretaryEmail:
        process.env.SECRETARY_EMAIL_DEFAULT ?? "segreteria@example.com",
      brokerName: "Euroansa",
      autoSendToSecretary: true,
    };
  }

  const validDocs = docs.filter(
    (d) => d.isValid && d.driveFileId && d.renamedFileName,
  );

  if (validDocs.length === 0) {
    throw new Error("Nessun documento valido nello storage");
  }

  let packageToken = app.packageToken;
  if (!packageToken) {
    packageToken = randomBytes(24).toString("hex");
    await db
      .update(applications)
      .set({ packageToken, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  const packageUrl = `${getAppBaseUrl()}/package/${applicationId}?t=${packageToken}`;

  const bodyText = `Buongiorno,

pratica ${app.clientName} pronta.

${packageUrl}

Grazie
Filippo`;

  const html = `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;

  await sendGmailHtml(
    {
      to: settings.secretaryEmail,
      subject: `Pratica completa ${app.clientName}`,
      html,
    },
    auth,
  );

  await db
    .update(applications)
    .set({
      status: "INVIATA_A_SEGRETERIA",
      sentToSecretaryAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  return { ok: true, documents: validDocs.length, packageUrl };
}
