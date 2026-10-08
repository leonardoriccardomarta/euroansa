import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  applications,
  documents,
  secretarySendLogs,
  systemSettings,
  users,
} from "@/db/schema";
import { getAppBaseUrl } from "@/lib/app-url";
import { isEuroansaFolder } from "@/lib/config/documents";
import { PACKAGE_LINK_TTL_DAYS } from "@/lib/db/setup-statements";
import { isSiteStorageKey } from "@/lib/storage/paths";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
  type GoogleOAuthClient,
} from "./auth";
import { sendGmailHtml } from "./gmail";
import {
  buildSecretaryEmailDraft,
  isSecretaryPackageDoc,
} from "./secretary-sender-draft";

export {
  buildSecretaryEmailDraft,
  isSecretaryPackageDoc,
} from "./secretary-sender-draft";

export type SendToSecretaryOptions = {
  /** Utente CRM che invia (null = auto-invio) */
  actorUserId?: string | null;
  actorName?: string | null;
  /** Forza nuovo token anche se ne esiste uno valido */
  regenerateToken?: boolean;
  /** Solo questi documenti (id). Se omesso = tutti i candidati. */
  documentIds?: string[];
  /** Oggetto mail (opzionale) */
  subject?: string;
  /**
   * Corpo testo. Se contiene `{{PACKAGE_URL}}` viene sostituito col link reale;
   * altrimenti se manca un URL https nel testo, il link viene aggiunto in coda.
   */
  bodyText?: string;
};

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

function packageExpiryDate(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + PACKAGE_LINK_TTL_DAYS);
  return d;
}

/** Firma mail: nome broker assegnato, altrimenti nome in Impostazioni. */
async function resolveEmailSignature(
  brokerId: string | null,
  settingsBrokerName: string,
): Promise<string> {
  if (brokerId) {
    const [broker] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, brokerId))
      .limit(1);
    if (broker?.name?.trim()) return broker.name.trim();
  }
  return settingsBrokerName.trim() || "Broker";
}

function applyPackageUrlToBody(bodyText: string, packageUrl: string): string {
  if (bodyText.includes("{{PACKAGE_URL}}")) {
    return bodyText.replaceAll("{{PACKAGE_URL}}", packageUrl);
  }
  if (/https?:\/\/\S+/i.test(bodyText)) {
    return bodyText;
  }
  return `${bodyText.trim()}\n\n${packageUrl}\n`;
}

export async function regeneratePackageToken(applicationId: string): Promise<{
  packageToken: string;
  packageUrl: string;
  expiresAt: Date;
}> {
  const packageToken = randomBytes(24).toString("hex");
  const expiresAt = packageExpiryDate();
  await db
    .update(applications)
    .set({
      packageToken,
      packageTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  return {
    packageToken,
    packageUrl: `${getAppBaseUrl()}/package/${applicationId}?t=${packageToken}`,
    expiresAt,
  };
}

export async function sendApplicationToSecretary(
  applicationId: string,
  options?: SendToSecretaryOptions,
) {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) throw new Error("Pratica non trovata");

  if (!app.relazioneStorageKey || !isSiteStorageKey(app.relazioneStorageKey)) {
    throw new Error(
      "Relazione mancante sullo storage sito: carica la relazione PDF prima di inviare",
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
      brokerName: "Broker",
      autoSendToSecretary: true,
      collaboratorSharePercent: 0.35,
      provenanceOptions: [],
      budgetTargets: null,
      budgetYear: "2026",
    };
  }

  const eligible = docs.filter(isSecretaryPackageDoc);
  const selectedIds = options?.documentIds?.length
    ? new Set(options.documentIds)
    : null;
  const selectedDocs = selectedIds
    ? eligible.filter((d) => selectedIds.has(d.id))
    : eligible;

  const legacyCount = docs.filter(
    (d) =>
      (d.isValid || isEuroansaFolder(d.storageSubfolder ?? "")) &&
      d.driveFileId &&
      !isSiteStorageKey(d.driveFileId),
  ).length;

  if (selectedDocs.length === 0) {
    throw new Error(
      legacyCount > 0
        ? "Documenti ancora su Drive: ricaricali nella sezione File (storage sito)"
        : selectedIds
          ? "Nessun documento selezionato tra quelli disponibili"
          : "Nessun documento valido sullo storage sito",
    );
  }

  const now = new Date();
  const tokenStillValid =
    Boolean(app.packageToken) &&
    app.packageTokenExpiresAt &&
    app.packageTokenExpiresAt > now;

  let packageToken = app.packageToken;
  let expiresAt = app.packageTokenExpiresAt;
  // Invio manuale con selezione: sempre nuovo token (pacchetto dedicato)
  const forceNew =
    options?.regenerateToken ||
    Boolean(options?.documentIds?.length) ||
    !tokenStillValid ||
    !packageToken;
  if (forceNew) {
    const regenerated = await regeneratePackageToken(applicationId);
    packageToken = regenerated.packageToken;
    expiresAt = regenerated.expiresAt;
  }

  const packageUrl = `${getAppBaseUrl()}/package/${applicationId}?t=${packageToken}`;
  const signature = await resolveEmailSignature(
    app.brokerId,
    settings.brokerName,
  );

  const draft = buildSecretaryEmailDraft({
    clientName: app.clientName,
    signature,
    packageUrl,
  });
  const subject = options?.subject?.trim() || draft.subject;
  const bodyText = applyPackageUrlToBody(
    options?.bodyText?.trim() || draft.bodyText,
    packageUrl,
  );

  const html = `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;

  await sendGmailHtml(
    {
      to: settings.secretaryEmail,
      subject,
      html,
    },
    auth,
  );

  const sentByName =
    options?.actorName?.trim() ||
    (options?.actorUserId ? signature : "Sistema (auto)");
  const sentAt = new Date();

  await db
    .update(applications)
    .set({
      status: "INVIATA_A_SEGRETERIA",
      sentToSecretaryAt: sentAt,
      sentToSecretaryByUserId: options?.actorUserId ?? null,
      sentToSecretaryByName: sentByName,
      lastPipelineError: null,
      lastPipelineErrorAt: null,
      updatedAt: sentAt,
    })
    .where(eq(applications.id, applicationId));

  await db.insert(secretarySendLogs).values({
    applicationId,
    sentByUserId: options?.actorUserId ?? null,
    sentByName,
    packageToken: packageToken!,
    packageExpiresAt: expiresAt ?? packageExpiryDate(sentAt),
    selectedDocumentIds: selectedDocs.map((d) => d.id),
    emailSubject: subject,
  });

  return {
    ok: true as const,
    documents: selectedDocs.length,
    packageUrl,
    expiresAt: expiresAt ?? packageExpiryDate(sentAt),
    legacySkipped: legacyCount,
  };
}
