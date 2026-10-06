"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { importClosedPracticesFromDrive } from "@/lib/resources/import-closed-practices";

export async function syncClosedPracticesFromDriveAction() {
  await requireAdmin();
  const connected = await listConnectedGoogleUsers();
  if (!connected[0]?.googleRefreshToken) {
    return {
      error:
        "Google ufficio non collegato. Impostazioni → Collega Google, poi riprova.",
    };
  }
  const auth = oauthClientFromRefreshToken(connected[0].googleRefreshToken);
  const result = await importClosedPracticesFromDrive({ auth, year: 2026 });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rogitate");
  revalidatePath("/dashboard/files");
  return { ok: true as const, ...result };
}
