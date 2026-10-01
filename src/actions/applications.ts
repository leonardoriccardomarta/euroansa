"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  documents,
  systemSettings,
  type ApplicationStatus,
} from "@/db/schema";
import { requireAdmin, requireSession } from "@/lib/auth";
import { processIncomingFiles } from "@/lib/pipeline";
import { sendApplicationToSecretary } from "@/lib/google/secretary-sender";
import { evaluateChecklist, inferEmploymentType } from "@/lib/checklist";
import { buildSollecitoMessage } from "@/lib/sollecito";

export async function assignBrokerAction(
  applicationId: string,
  brokerId: string | null,
) {
  await requireAdmin();
  await db
    .update(applications)
    .set({
      brokerId: brokerId || null,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateApplicationStatusAction(
  applicationId: string,
  status: ApplicationStatus,
) {
  await requireSession();
  const allowed: ApplicationStatus[] = [
    "INVIATA_A_SEGRETERIA",
    "INVIATA_IN_BANCA",
    "PERITO_NOMINATO",
    "DELIBERATA",
  ];
  if (!allowed.includes(status)) {
    return { error: "Stato non consentito" };
  }
  await db
    .update(applications)
    .set({ status, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function sendToSecretaryAction(applicationId: string) {
  await requireSession();
  await sendApplicationToSecretary(applicationId);
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Elimina pratica + documenti collegati (cascade). Solo admin. */
export async function deleteApplicationAction(applicationId: string) {
  await requireAdmin();
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  await db.delete(applications).where(eq(applications.id, applicationId));
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadDocumentsAction(
  applicationId: string,
  formData: FormData,
) {
  await requireSession();
  const files = formData.getAll("files") as File[];
  const incoming = await Promise.all(
    files
      .filter((f) => f && f.size > 0)
      .map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        mimeType: f.type || "application/octet-stream",
        originalFileName: f.name,
      })),
  );

  await processIncomingFiles(incoming, { applicationId });
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true, count: incoming.length };
}

export async function getSollecitoTextAction(applicationId: string) {
  await requireSession();
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  const checklist = evaluateChecklist(inferEmploymentType(docs), docs);
  const text = buildSollecitoMessage({
    clientName: app.clientName,
    brokerName: settings?.brokerName ?? "Euroansa",
    checklist,
  });

  return { text };
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const secretaryEmail = String(formData.get("secretaryEmail") ?? "").trim();
  const brokerName = String(formData.get("brokerName") ?? "").trim();
  const autoSendToSecretary = formData.get("autoSendToSecretary") === "on";

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({ secretaryEmail, brokerName, autoSendToSecretary })
      .where(eq(systemSettings.id, "global"));
  } else {
    await db.insert(systemSettings).values({
      id: "global",
      secretaryEmail,
      brokerName,
      autoSendToSecretary,
    });
  }

  revalidatePath("/dashboard/settings");
}
