import { NextRequest, NextResponse } from "next/server";
import { eq, ilike } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { sendGmailHtml } from "@/lib/google/gmail";

export const maxDuration = 60;

/**
 * Test one-shot: invia mail pacchetto a un indirizzo.
 * POST /api/test-secretary-email
 * Authorization: Bearer CRON_SECRET
 * Body JSON: { "to": "email@...", "clientName": "Mario Rossi" }
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { to?: string; clientName?: string; applicationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  const to = body.to?.trim().toLowerCase();
  if (!to) {
    return NextResponse.json({ error: "Campo to obbligatorio" }, { status: 400 });
  }

  let app;
  if (body.applicationId) {
    const [row] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, body.applicationId))
      .limit(1);
    app = row;
  } else {
    const name = (body.clientName ?? "Mario Rossi").trim();
    const [row] = await db
      .select()
      .from(applications)
      .where(ilike(applications.clientName, name))
      .limit(1);
    app = row;
  }

  if (!app) {
    return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
  }

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
      return NextResponse.json(
        { error: "Nessun Google collegato" },
        { status: 500 },
      );
    }
    googleAuth = oauthClientFromRefreshToken(connected[0].googleRefreshToken);
  }

  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  await sendGmailHtml(
    {
      to,
      subject: `Pratica completa ${app.clientName}`,
      html,
    },
    googleAuth,
  );

  return NextResponse.json({
    ok: true,
    to,
    applicationId: app.id,
    clientName: app.clientName,
    packageUrl,
    documents: validDocs.length,
    hasRelazione,
    fromHub: settings?.secretaryEmail ?? null,
  });
}
