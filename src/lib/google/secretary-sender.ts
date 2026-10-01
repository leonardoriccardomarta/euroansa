import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/config/documents";
import { inferEmploymentType } from "@/lib/checklist";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
  type GoogleOAuthClient,
} from "./auth";
import { downloadFileFromDrive } from "./drive";
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
  const attachments: Array<{
    filename: string;
    mimeType: string;
    buffer: Buffer;
  }> = [];

  for (const doc of validDocs) {
    try {
      const downloaded = await downloadFileFromDrive(doc.driveFileId!, auth);
      attachments.push({
        filename: doc.renamedFileName,
        mimeType: downloaded.mimeType,
        buffer: downloaded.buffer,
      });
    } catch (err) {
      console.error(
        "download Drive failed",
        doc.renamedFileName,
        doc.driveFileId,
        err,
      );
      throw new Error(
        `Impossibile allegare ${doc.renamedFileName}: download Drive fallito`,
      );
    }
  }

  if (attachments.length === 0) {
    throw new Error("Nessun documento valido da allegare da Drive");
  }

  const fileListHtml = attachments
    .map((a) => `<li style="margin:4px 0">${a.filename}</li>`)
    .join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a1a1a;max-width:640px">
      <h2 style="color:#0b3d2e">Pratica mutuo completa</h2>
      <p>Buongiorno,<br/>la pratica di <strong>${app.clientName}</strong> è pronta per l'istruttoria.<br/>In allegato i documenti controllati e rinominati.</p>
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
      <h3>Documenti allegati (${attachments.length})</h3>
      <ul>${fileListHtml}</ul>
      ${
        app.driveFolderUrl
          ? `<p><a href="${app.driveFolderUrl}" style="display:inline-block;background:#0b3d2e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Apri cartella Google Drive</a></p>`
          : ""
      }
    </div>
  `;

  await sendGmailHtml(
    {
      to: settings.secretaryEmail,
      subject: `[PRATICA COMPLETA] ${app.clientName} - Pratica Mutuo`,
      html,
      attachments,
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

  return { ok: true, attachments: attachments.length };
}
