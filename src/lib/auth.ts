import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

const COOKIE_NAME = "euroansa_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET non configurata");
  return new TextEncoder().encode(secret);
}

export const ALLOWED_EMAILS = [
  "info.inzago@euroansa.it",
  "martaleo110@gmail.com",
  "aiorchestratoor@gmail.com",
  "leonardoriccar.marta01@universitadipavia.it",
];

export function isEmailAuthorized(email?: string | null): boolean {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  if (ALLOWED_EMAILS.some((a) => a.toLowerCase() === norm)) return true;
  if (norm.endsWith("@euroansa.it")) return true;
  if (
    process.env.ADMIN_EMAIL &&
    norm === process.env.ADMIN_EMAIL.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "BROKER";
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("14d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as "ADMIN" | "BROKER",
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Non autenticato");
  if (!isEmailAuthorized(session.email)) {
    throw new Error("Accesso non autorizzato");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("Permesso negato");
  return session;
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<User | null> {
  if (!isEmailAuthorized(email)) {
    return null;
  }
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

export function canAccessApplication(
  session: SessionUser,
  app: { brokerId?: string | null; status?: string | null },
): boolean {
  if (session.role === "ADMIN") return true;
  if (session.email.toLowerCase() === "info.inzago@euroansa.it") return true;
  if (app.status === "ROGITATA") return true;
  if (!app.brokerId) return true;
  return app.brokerId === session.id;
}
