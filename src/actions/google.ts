"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { clearAllGoogleConnections } from "@/lib/google/auth";

/** Scollega l'unico hub Google ufficio. */
export async function disconnectGoogleAction(): Promise<void> {
  await requireAdmin();
  await clearAllGoogleConnections();
  try {
    const { clearGoogleHubFromR2 } = await import("@/lib/cron/neon-gate");
    await clearGoogleHubFromR2();
  } catch (err) {
    console.error("clearGoogleHubFromR2", err);
  }
  revalidatePath("/dashboard/settings");
}
