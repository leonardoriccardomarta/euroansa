"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { clearAllGoogleConnections } from "@/lib/google/auth";

/** Scollega l'unico hub Google ufficio. */
export async function disconnectGoogleAction(): Promise<void> {
  await requireAdmin();
  await clearAllGoogleConnections();
  revalidatePath("/dashboard/settings");
}
