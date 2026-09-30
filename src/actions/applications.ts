"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  documents,
  systemSettings,
  type ApplicationStatus,
  type EmploymentType,
} from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { processIncomingFiles, refreshApplicationState } from "@/lib/pipeline";
import { sendApplicationToSecretary } from "@/lib/google/secretary-sender";
import { evaluateChecklist } from "@/lib/checklist";
import { buildSollecitoMessage } from "@/lib/sollecito";

export async function updateApplicationStatusAction(
  applicationId: string,
  status: ApplicationStatus,
) {
  await requireSession();
  await db
    .update(applications)
    .set({ status, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateEmploymentTypeAction(
  applicationId: string,
  employmentType: EmploymentType,
) {
  await requireSession();
  await db
    .update(applications)
    .set({ employmentType, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
  await refreshApplicationState(applicationId);
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

  const checklist = evaluateChecklist(app.employmentType, docs);
  const text = buildSollecitoMessage({
    clientName: app.clientName,
    brokerName: settings?.brokerName ?? "Euroansa",
    checklist,
  });

  return { text };
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  await requireSession();
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
