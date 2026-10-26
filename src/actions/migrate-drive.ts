"use server";

import { requireAdmin } from "@/lib/auth";
import {
  executeDriveMigration,
  type MigrationExecutionResult,
} from "@/lib/drive-migration/engine";
import { revalidatePath } from "next/cache";

export async function runDriveMigrationAction(params: {
  dryRun: boolean;
}): Promise<MigrationExecutionResult> {
  await requireAdmin();
  const res = await executeDriveMigration({ dryRun: params.dryRun });
  if (!params.dryRun && res.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/rogitate");
    revalidatePath("/dashboard/files");
    revalidatePath("/dashboard/settings");
  }
  return res;
}
