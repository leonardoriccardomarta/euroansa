import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createGoogleOAuthClient, getGoogleRedirectUri } from "@/lib/google/auth";

function getSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET non configurata");
  return new TextEncoder().encode(secret);
}

function appBaseUrl(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  }
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const base = appBaseUrl(req);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${base}/dashboard/settings?google=denied`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${base}/dashboard/settings?google=error&msg=missing_code`,
    );
  }

  try {
    const { payload } = await jwtVerify(state, getSecret());
    if (payload.purpose !== "google_oauth" || !payload.userId) {
      throw new Error("State OAuth non valido");
    }
    const userId = String(payload.userId);

    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.redirect(
        `${base}/dashboard?google=error&msg=${encodeURIComponent(
          "Solo admin può collegare Google",
        )}`,
      );
    }

    const client = createGoogleOAuthClient(getGoogleRedirectUri());
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      // Se Google non rilascia refresh (già autorizzato senza prompt), errore chiaro
      return NextResponse.redirect(
        `${base}/dashboard/settings?google=error&msg=${encodeURIComponent(
          "Nessun refresh_token: revoca l'accesso Euroansa su https://myaccount.google.com/permissions e riprova",
        )}`,
      );
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const googleEmail = me.data.email?.toLowerCase() ?? null;

    await db
      .update(users)
      .set({
        googleRefreshToken: tokens.refresh_token,
        googleEmail,
        googleConnectedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.redirect(`${base}/dashboard/settings?google=ok`);
  } catch (error) {
    console.error("google callback error", error);
    return NextResponse.redirect(
      `${base}/dashboard/settings?google=error&msg=${encodeURIComponent(
        error instanceof Error ? error.message : "callback failed",
      )}`,
    );
  }
}
