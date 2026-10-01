import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings } from "@/db/schema";
import {
  DOCUMENT_TYPE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
} from "@/lib/config/documents";
import { evaluateChecklist, inferEmploymentType } from "@/lib/checklist";
import { sendGmailHtml } from "./gmail";

export async function sendApplicationToSecretary(applicationId: string) {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) throw new Error("Pratica non trovata");

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
  const checklist = evaluateChecklist(employmentType, docs);
  const scoring = app.preScoringData;
  const checklistHtml = checklist.required
    .map((type) => {
      const ok = checklist.presentValid.includes(type);
      return `<li style="margin:4px 0;list-style:none">${ok ? "[OK]" : "[Manca]"} ${DOCUMENT_TYPE_LABELS[type]}</li>`;
    })
    .join("");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a1a1a;max-width:640px">
      <h2 style="color:#0b3d2e">Pratica mutuo completa</h2>
      <p>Buongiorno,<br/>la pratica di <strong>${app.clientName}</strong> è pronta per l'istruttoria.</p>
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
      <h3>Checklist documenti</h3>
      <ul>${checklistHtml}</ul>
      <p>
        <a href="${app.driveFolderUrl ?? "#"}" style="display:inline-block;background:#0b3d2e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
          Apri cartella Google Drive
        </a>
      </p>
      <p style="color:#666;font-size:12px">Inviato automaticamente da ${settings.brokerName} — Euroansa</p>
    </div>
  `;

  await sendGmailHtml({
    to: settings.secretaryEmail,
    subject: `[PRATICA COMPLETA] ${app.clientName} - Pratica Mutuo`,
    html,
  });

  await db
    .update(applications)
    .set({
      status: "INVIATA_A_SEGRETERIA",
      sentToSecretaryAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  return { ok: true };
}
