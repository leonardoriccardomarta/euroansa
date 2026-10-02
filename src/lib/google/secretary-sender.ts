import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/config/documents";
import { inferEmploymentType } from "@/lib/checklist";
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

  const employmentType = inferEmploymentType(docs);
  const scoring = app.preScoringData;

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

  const packageUrl = `${getAppBaseUrl()}/api/packages/${applicationId}?t=${packageToken}`;

  const fileListHtml = [
    ...validDocs.map((d) => {
      const folder = d.storageSubfolder ? `[${d.storageSubfolder}] ` : "";
      return `<li style="margin:4px 0">${folder}${d.renamedFileName}</li>`;
    }),
    `<li style="margin:4px 0"><strong>Relazione:</strong> ${app.relazioneFileName ?? "relazione.pdf"}</li>`,
  ].join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a1a1a;max-width:640px">
      <h2 style="color:#0b3d2e">Pratica mutuo completa</h2>
      <p>Buongiorno,<br/>la pratica di <strong>${app.clientName}</strong> è pronta per l'istruttoria.</p>
      <p>Scarica il pacchetto documenti (ZIP) dal link qui sotto — non serve WeTransfer né Drive.</p>
      <p style="margin:20px 0">
        <a href="${packageUrl}" style="display:inline-block;background:#0b3d2e;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">
          Scarica pacchetto ZIP
        </a>
      </p>
      <h3>Anagrafica</h3>
      <ul>
        <li><strong>Nome:</strong> ${app.clientName}</li>
        <li><strong>Email:</strong> ${app.clientEmail}</li>
        <li><strong>CF:</strong> ${app.clientFiscalCode ?? "—"}</li>
        <li><strong>Profilo:</strong> ${EMPLOYMENT_TYPE_LABELS[employmentType]}</li>
      </ul>
      <h3>Sintesi economica</h3>
      <ul>
        <li><strong>Netto mensile medio:</strong> €${scoring?.net_monthly_income?.toFixed(2) ?? "—"}</li>
        <li><strong>Rata max sostenibile (35%):</strong> €${scoring?.estimated_max_installment?.toFixed(2) ?? "—"}</li>
        <li><strong>Obblighi mensili:</strong> €${scoring?.monthly_obligations?.toFixed(2) ?? "0.00"}</li>
        <li><strong>CUD / reddito lordo annuo:</strong> €${scoring?.cud_gross_annual_income?.toFixed(2) ?? "—"}</li>
      </ul>
      <h3>Documenti nel pacchetto (${validDocs.length + 1})</h3>
      <ul>${fileListHtml}</ul>
      <p style="font-size:12px;color:#666;margin-top:24px">Link valido senza login. Conservalo in modo sicuro.</p>
    </div>
  `;

  await sendGmailHtml(
    {
      to: settings.secretaryEmail,
      subject: `[PRATICA COMPLETA] ${app.clientName} - Pratica Mutuo`,
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
