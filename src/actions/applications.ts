"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  documents,
  systemSettings,
  users,
  type ApplicationStatus,
  type DocumentType,
} from "@/db/schema";
import { requireAdmin, requireSession } from "@/lib/auth";
import { processIncomingFiles, refreshApplicationState } from "@/lib/pipeline";
import {
  regeneratePackageToken,
  sendApplicationToSecretary,
} from "@/lib/google/secretary-sender";
import { evaluateChecklist } from "@/lib/checklist";
import { buildSollecitoMessage } from "@/lib/sollecito";
import { setApplicationPipelineError } from "@/lib/applications/errors";
import {
  deletePracticeBlobs,
  uploadRelazioneFile,
} from "@/lib/storage/blob";
import {
  notifyBrokerAssigned,
  notifySecretarySendFailed,
} from "@/lib/notify/broker-mail";

export async function assignBrokerAction(
  applicationId: string,
  brokerId: string | null,
) {
  await requireAdmin();

  if (brokerId) {
    const [broker] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, brokerId))
      .limit(1);
    if (!broker || broker.role !== "BROKER") {
      return { error: "Seleziona un utente con ruolo Broker" };
    }
  }

  const [before] = await db
    .select({ brokerId: applications.brokerId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  await db
    .update(applications)
    .set({
      brokerId: brokerId || null,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  if (brokerId && brokerId !== before?.brokerId) {
    void notifyBrokerAssigned({ applicationId, brokerId }).catch((err) =>
      console.error("notify assign failed", err),
    );
  }

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
    "DOCUMENTI_INCOMPLETI",
    "COMPLETA_DA_INOLTRARE",
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
  const session = await requireSession();
  try {
    const result = await sendApplicationToSecretary(applicationId, {
      actorUserId: session.id,
      actorName: session.name,
      regenerateToken: true,
    });
    revalidatePath(`/dashboard/applications/${applicationId}`);
    revalidatePath("/dashboard");
    return {
      ok: true as const,
      packageUrl: result.packageUrl,
      legacySkipped: result.legacySkipped,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invio fallito";
    await setApplicationPipelineError(applicationId, `Invio segreteria: ${msg}`);
    void notifySecretarySendFailed({
      applicationId,
      errorMessage: msg,
    }).catch((e) => console.error("notify send fail mail", e));
    revalidatePath(`/dashboard/applications/${applicationId}`);
    revalidatePath("/dashboard");
    return { error: msg };
  }
}

/** Nuovo token + 7 giorni, senza reinviare email. */
export async function regeneratePackageLinkAction(applicationId: string) {
  await requireSession();
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  try {
    const result = await regeneratePackageToken(applicationId);
    revalidatePath(`/dashboard/applications/${applicationId}`);
    return {
      ok: true as const,
      packageUrl: result.packageUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Rigenerazione fallita",
    };
  }
}

/** Elimina pratica + documenti DB + file R2. Solo admin. */
export async function deleteApplicationAction(applicationId: string) {
  await requireAdmin();
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  try {
    await deletePracticeBlobs(applicationId);
  } catch (err) {
    console.error("blob delete on application remove", err);
  }

  await db.delete(applications).where(eq(applications.id, applicationId));
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadRelazioneAction(
  applicationId: string,
  formData: FormData,
) {
  await requireSession();
  const file = formData.get("relazione") as File | null;
  if (!file || file.size === 0) {
    return { error: "Seleziona un file PDF relazione" };
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const uploaded = await uploadRelazioneFile({
      applicationId,
      clientName: app.clientName,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      buffer,
    });

    await db
      .update(applications)
      .set({
        relazioneStorageKey: uploaded.pathname,
        relazioneFileName: uploaded.pathname.split("/").pop() ?? file.name,
        relazioneUploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    await refreshApplicationState(applicationId);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Upload relazione fallito";
    await setApplicationPipelineError(applicationId, `Relazione: ${msg}`);
    return { error: msg };
  }

  await setApplicationPipelineError(applicationId, null);
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadDocumentsAction(
  applicationId: string,
  formData: FormData,
) {
  const session = await requireSession();
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

  const [app] = await db
    .select({ brokerId: applications.brokerId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  const brokerId = app?.brokerId ?? session.id;

  // Se pratica senza titolare, assegna chi sta caricando
  if (app && !app.brokerId) {
    await db
      .update(applications)
      .set({ brokerId: session.id, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  try {
    const result = await processIncomingFiles(incoming, {
      applicationId,
      brokerId,
    });
    if (result.errors.length > 0) {
      await setApplicationPipelineError(
        applicationId,
        result.errors.slice(0, 3).join("; "),
      );
    } else {
      await setApplicationPipelineError(applicationId, null);
    }
    revalidatePath(`/dashboard/applications/${applicationId}`);
    revalidatePath("/dashboard");
    return {
      ok: true as const,
      count: result.processed,
      errors: result.errors,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Upload o analisi fallita";
    await setApplicationPipelineError(applicationId, msg);
    revalidatePath(`/dashboard/applications/${applicationId}`);
    return { error: msg };
  }
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

  const checklist = evaluateChecklist(app.requiredDocumentTypes, docs);
  const text = buildSollecitoMessage({
    clientName: app.clientName,
    brokerName: settings?.brokerName ?? "Euroansa",
    checklist,
  });

  return { text };
}

export async function updateRequiredDocumentsAction(
  applicationId: string,
  requiredDocumentTypes: DocumentType[],
) {
  await requireSession();
  const cleaned = [
    ...new Set(
      requiredDocumentTypes.filter(
        (t): t is DocumentType => Boolean(t) && t !== "SCONOSCIUTO",
      ),
    ),
  ];

  await db
    .update(applications)
    .set({
      requiredDocumentTypes: cleaned,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  await refreshApplicationState(applicationId);
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true, requiredDocumentTypes: cleaned };
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
