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
  const role = String(formData.get("role") ?? "BROKER") as "ADMIN" | "BROKER";

  if (!email || !name || password.length < 6) {
    return;
  }

  const passwordHash = await hashPassword(password);
  try {
    await db.insert(users).values({ email, name, passwordHash, role });
  } catch {
    return;
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/users");
}

export async function deleteUserAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  if (session.id === userId) {
    return;
  }

  await db.delete(users).where(eq(users.id, userId));

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/dashboard/users");
}
