import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, users } from "@/db/schema";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  getOfficeGoogleHub,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { sendGmailHtml } from "@/lib/google/gmail";
import { APP_MAIL_PREFIX, APP_NAME } from "@/lib/brand";

async function sendOfficeMail(params: {
  to: string;
  subject: string;
  bodyText: string;
}) {
  const hub = await getOfficeGoogleHub();
  if (!hub?.googleRefreshToken) {
    console.warn("notify skip: Google ufficio non collegato");
    return { ok: false as const, error: "Google non collegato" };
  }

  const html = `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${params.bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;

  try {
    await sendGmailHtml(
      {
        to: params.to,
        subject: params.subject,
        html,
      },
      oauthClientFromRefreshToken(hub.googleRefreshToken),
    );
    return { ok: true as const };
  } catch (err) {
    console.error("broker notify mail failed", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Mail al broker quando gli viene assegnata una pratica. */
export async function notifyBrokerAssigned(params: {
  applicationId: string;
  brokerId: string;
}) {
  const [broker] = await db
    .select({
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, params.brokerId))
    .limit(1);

  if (!broker || broker.role !== "BROKER" || !broker.email) return;

  const [app] = await db
    .select({
      clientName: applications.clientName,
      clientEmail: applications.clientEmail,
    })
    .from(applications)
    .where(eq(applications.id, params.applicationId))
    .limit(1);
  if (!app) return;

  const url = `${getAppBaseUrl()}/dashboard/applications/${params.applicationId}`;
  await sendOfficeMail({
    to: broker.email,
    subject: `${APP_MAIL_PREFIX} Pratica ${app.clientName} — assegnata a te`,
    bodyText: `Ciao ${broker.name},

ti è stata assegnata la pratica ${app.clientName} (${app.clientEmail}).

Apri: ${url}

${APP_NAME}`,
  });
}

/**
 * Mail al broker (o admin se senza broker) quando fallisce l'invio a segreteria.
 */
export async function notifySecretarySendFailed(params: {
  applicationId: string;
  errorMessage: string;
}) {
  const [app] = await db
    .select({
      clientName: applications.clientName,
      brokerId: applications.brokerId,
    })
    .from(applications)
    .where(eq(applications.id, params.applicationId))
    .limit(1);
  if (!app) return;

  let to: string | null = null;
  let name = "team";

  if (app.brokerId) {
    const [broker] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, app.brokerId))
      .limit(1);
    if (broker?.email) {
      to = broker.email;
      name = broker.name;
    }
  }

  if (!to) {
    const [admin] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.role, "ADMIN"))
      .limit(1);
    if (admin?.email) {
      to = admin.email;
      name = admin.name;
    }
  }

  if (!to) return;

  const url = `${getAppBaseUrl()}/dashboard/applications/${params.applicationId}`;
  await sendOfficeMail({
    to,
    subject: `${APP_MAIL_PREFIX} Invio segreteria fallito — ${app.clientName}`,
    bodyText: `Ciao ${name},

l'invio automatico/manuale a segreteria per ${app.clientName} è fallito.

Errore: ${params.errorMessage}

Apri la pratica e riprova: ${url}

${APP_NAME}`,
  });
}
