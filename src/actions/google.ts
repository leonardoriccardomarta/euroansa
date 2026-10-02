"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export async function disconnectGoogleAction(): Promise<void> {
  const session = await requireAdmin();
  await db
    .update(users)
    .set({
      googleRefreshToken: null,
      googleEmail: null,
      googleConnectedAt: null,
    })
    .where(eq(users.id, session.id));
  revalidatePath("/dashboard/settings");
}
