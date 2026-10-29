"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  executeMigrateRogitate2026,
  type MigrationRogitate2026Result,
} from "@/lib/resources/migrate-rogitate-2026";

export async function migrateRogitate2026Action(): Promise<MigrationRogitate2026Result> {
  await requireAdmin();

  const result = await executeMigrateRogitate2026();

  if (result.ok) {
    revalidatePath("/dashboard/rogitate");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/settings");
  }

  return result;
}
