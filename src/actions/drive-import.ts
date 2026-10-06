"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import {
  importClosedPracticesFromDrive,
  reclassifyImportedDocuments,
} from "@/lib/resources/import-closed-practices";

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
  revalidatePath("/dashboard/risorse");
  return { ok: true as const, ...result };
}

/** Solo riclassifica tipi da nome file + checklist (senza ridepositare da Drive). */
export async function reclassifyImportedDocsAction() {
  await requireAdmin();
  const result = await reclassifyImportedDocuments();
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rogitate");
  revalidatePath("/dashboard/risorse");
  return { ok: true as const, ...result };
}
