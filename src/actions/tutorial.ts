"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications, users } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-url";
import { defaultStorageFolders } from "@/lib/config/documents";
import { practiceStoragePrefix } from "@/lib/storage/blob";
import {
  TUTORIAL_CLIENT_NAME,
  TUTORIAL_REQUIRED_DOCS,
  tutorialClientEmail,
} from "@/lib/tutorial";

export async function markTutorialCompleteAction() {
  const session = await requireSession();
  await db
    .update(users)
    .set({ tutorialCompletedAt: new Date() })
    .where(eq(users.id, session.id));
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function resetTutorialAction() {
  const session = await requireSession();
  await db
    .update(users)
    .set({ tutorialCompletedAt: null })
    .where(eq(users.id, session.id));
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/**
 * Crea (o riusa) la pratica/cartella guida personale dell'utente.
 * ADMIN: isTest=true (nascosta ai broker).
 * BROKER: isTest=false così la vede nella propria lista.
 */
export async function ensureTutorialPracticeAction() {
  const session = await requireSession();
  const email = tutorialClientEmail(session.id);

  const [existing] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.clientEmail, email))
    .limit(1);

  if (existing) {
    await db
      .update(applications)
      .set({
        clientName: TUTORIAL_CLIENT_NAME,
        brokerId: session.id,
        requiredDocumentTypes: TUTORIAL_REQUIRED_DOCS,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, existing.id));
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/files");
    revalidatePath(`/dashboard/applications/${existing.id}`);
    return { ok: true as const, applicationId: existing.id };
  }

  const folders = defaultStorageFolders(TUTORIAL_CLIENT_NAME);
  const isAdmin = session.role === "ADMIN";

  const [created] = await db
    .insert(applications)
    .values({
      clientName: TUTORIAL_CLIENT_NAME,
      clientEmail: email,
      clientFiscalCode: "RSSMRA80A01H501U",
      employmentType: "DIPENDENTE_INDETERMINATO",
      status: "DOCUMENTI_INCOMPLETI",
      requiredDocumentTypes: TUTORIAL_REQUIRED_DOCS,
      storageFolders: folders,
      brokerId: session.id,
      isTest: isAdmin,
      driveFolderUrl: null,
      driveFolderId: null,
    })
    .returning({ id: applications.id });

  if (!created) return { error: "Impossibile creare la pratica guida" };

  const prefix = practiceStoragePrefix(created.id);
  const folderUrl = `${getAppBaseUrl()}/dashboard/files/${created.id}`;
  await db
    .update(applications)
    .set({
      driveFolderId: prefix,
      driveFolderUrl: folderUrl,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, created.id));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/files");
  revalidatePath(`/dashboard/applications/${created.id}`);
  revalidatePath(`/dashboard/files/${created.id}`);

  return { ok: true as const, applicationId: created.id };
}
