import { randomBytes } from "crypto";
import { eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { sendGmailHtml } from "@/lib/google/gmail";

export async function sendTestSecretaryEmail(params: {
  to: string;
  clientName?: string;
  applicationId?: string;
}) {
  const to = params.to.trim().toLowerCase();
  if (!to) return { ok: false as const, error: "Campo to obbligatorio" };

  let app;
  if (params.applicationId) {
    const [row] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, params.applicationId))
      .limit(1);
    app = row;
  } else {
    const name = (params.clientName ?? "Mario Rossi").trim();
    const [row] = await db
      .select()
      .from(applications)
      .where(ilike(applications.clientName, `%${name}%`))
      .limit(1);
    app = row;
  }

  if (!app) return { ok: false as const, error: "Pratica non trovata" };

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, app.id));

  const validDocs = docs.filter(
    (d) => d.isValid && d.driveFileId && d.renamedFileName,
  );

  let packageToken = app.packageToken;
  if (!packageToken) {
    packageToken = randomBytes(24).toString("hex");
    await db
      .update(applications)
      .set({ packageToken, updatedAt: new Date() })
      .where(eq(applications.id, app.id));
  }

  const packageUrl = `${getAppBaseUrl()}/api/packages/${app.id}?t=${packageToken}`;

  const fileLines =
    validDocs.length > 0
      ? validDocs
          .map((d) => {
            const folder = d.storageSubfolder ? `${d.storageSubfolder}/` : "";
            return `${folder}${d.renamedFileName}`;
          })
          .join("\n")
      : "(nessun documento valido ancora in storage)";

  const relazioneName = app.relazioneFileName ?? "relazione.pdf";
  const hasRelazione = Boolean(app.relazioneStorageKey);

  const bodyText = `Buongiorno,

pratica ${app.clientName} pronta.

Documenti:
${fileLines}
${hasRelazione ? `Relazione: ${relazioneName}` : "Relazione: (non caricata)"}

Scarica il pacchetto:
${packageUrl}

Grazie
Filippo`;

  const html = `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;

  let googleAuth;
  try {
    if (app.brokerId) {
      googleAuth = await getGoogleAuthForUser(app.brokerId);
    }
  } catch {
    // fall through
  }
  if (!googleAuth) {
    const connected = await listConnectedGoogleUsers();
    if (!connected[0]) {
      return { ok: false as const, error: "Nessun Google collegato" };
    }
    googleAuth = oauthClientFromRefreshToken(connected[0].googleRefreshToken);
  }

  await sendGmailHtml(
    {
      to,
      subject: `Pratica completa ${app.clientName}`,
      html,
    },
    googleAuth,
  );

  return {
    ok: true as const,
    to,
    applicationId: app.id,
    clientName: app.clientName,
    packageUrl,
    documents: validDocs.length,
    hasRelazione,
  };
}
