"use server";

import { redirect } from "next/navigation";
import {
  authenticateUser,
  createSession,
  destroySession,
  hashPassword,
  requireAdmin,
  requireSession,
} from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const user = await authenticateUser(email, password);
  if (!user) {
    return { error: "Email o password non validi" };
  }

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Solo broker: un unico ADMIN = hub Gmail/Drive ufficio
  const role = "BROKER" as const;

  if (!email || !name || password.length < 6) {
    return;
  }

  const passwordHash = await hashPassword(password);
  const shareRaw = String(formData.get("payoutSharePercent") ?? "30").trim();
  let payoutSharePercent = Number(shareRaw.replace(",", "."));
  if (!Number.isFinite(payoutSharePercent)) payoutSharePercent = 30;
  if (payoutSharePercent > 1) payoutSharePercent /= 100;
  payoutSharePercent = Math.min(1, Math.max(0, payoutSharePercent));

  try {
    await db.insert(users).values({
      email,
      name,
      passwordHash,
      role,
      payoutSharePercent,
      overrideOnOthersPercent: 0,
    });
  } catch {
    return;
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/users");
}

export async function updateUserSharesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return;

  const { clampSharePercent } = await import("@/lib/economics");
  const payoutSharePercent = clampSharePercent(
    formData.get("payoutSharePercent"),
    0.3,
  );
  const overrideOnOthersPercent = clampSharePercent(
    formData.get("overrideOnOthersPercent"),
    0,
  );

  await db
    .update(users)
    .set({ payoutSharePercent, overrideOnOthersPercent })
    .where(eq(users.id, userId));

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/rogitate");
}

export async function deleteUserAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  if (session.id === userId) {
    return;
  }

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Non eliminare altri admin (max 1 admin org)
  if (!target || target.role === "ADMIN") {
    return;
  }

  await db.delete(users).where(eq(users.id, userId));

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/users");
}
