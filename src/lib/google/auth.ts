import { google, type Auth } from "googleapis";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export type GoogleOAuthClient = Auth.OAuth2Client;

export function getGoogleRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI?.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/api/google/callback`;
}

function requireClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET richiesti");
  }
  return { clientId, clientSecret };
}

/** Client OAuth senza token (per avviare il flusso / scambiare code). */
export function createGoogleOAuthClient(redirectUri?: string): GoogleOAuthClient {
  const { clientId, clientSecret } = requireClientCredentials();
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri ?? getGoogleRedirectUri(),
  );
}

export function oauthClientFromRefreshToken(
  refreshToken: string,
): GoogleOAuthClient {
  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** @deprecated preferisci getGoogleAuthForUser / oauthClientFromRefreshToken */
export function getGoogleOAuthClient(): GoogleOAuthClient {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    throw new Error(
      "Nessun GOOGLE_REFRESH_TOKEN globale: collega Google da Impostazioni",
    );
  }
  return oauthClientFromRefreshToken(refreshToken);
}

export async function getUserGoogleRefreshToken(
  userId: string,
): Promise<string | null> {
  const [user] = await db
    .select({
      googleRefreshToken: users.googleRefreshToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.googleRefreshToken ?? null;
}

export async function getGoogleAuthForUser(
  userId: string,
): Promise<GoogleOAuthClient> {
  const token = await getUserGoogleRefreshToken(userId);
  if (token) return oauthClientFromRefreshToken(token);

  // Fallback legacy: env globale solo se nessun token user (migrazione)
  const legacy = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (legacy) return oauthClientFromRefreshToken(legacy);

  throw new Error(
    "Google non collegato per questo utente. Vai in Impostazioni → Collega Google.",
  );
}

export function getDriveClient(auth?: GoogleOAuthClient) {
  return google.drive({
    version: "v3",
    auth: auth ?? getGoogleOAuthClient(),
  });
}

export function getGmailClient(auth?: GoogleOAuthClient) {
  return google.gmail({
    version: "v1",
    auth: auth ?? getGoogleOAuthClient(),
  });
}

export type ConnectedGoogleUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "BROKER";
  googleEmail: string | null;
  googleRefreshToken: string;
};

/** Utenti con OAuth collegato; se nessuno, fallback token env → admin. */
export async function listConnectedGoogleUsers(): Promise<
  ConnectedGoogleUser[]
> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      googleEmail: users.googleEmail,
      googleRefreshToken: users.googleRefreshToken,
    })
    .from(users)
    .where(isNotNull(users.googleRefreshToken));

  const connected = rows.filter(
    (r): r is ConnectedGoogleUser => Boolean(r.googleRefreshToken),
  );

  if (connected.length > 0) return connected;

  const legacy = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!legacy) return [];

  const [admin] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      googleEmail: users.googleEmail,
    })
    .from(users)
    .where(eq(users.role, "ADMIN"))
    .limit(1);

  if (!admin) return [];

  return [
    {
      ...admin,
      googleRefreshToken: legacy,
    },
  ];
}

export function buildGoogleAuthUrl(state: string): string {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_OAUTH_SCOPES],
    state,
  });
}
