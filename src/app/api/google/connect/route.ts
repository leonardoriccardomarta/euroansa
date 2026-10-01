import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSession } from "@/lib/auth";
import { buildGoogleAuthUrl } from "@/lib/google/auth";

function getSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET non configurata");
  return new TextEncoder().encode(secret);
}

/** Avvia OAuth Google (Gmail + Drive) per l'utente loggato. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const state = await new SignJWT({
      userId: session.id,
      purpose: "google_oauth",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("15m")
      .sign(getSecret());

    const url = buildGoogleAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("google connect error", error);
    const dest = new URL("/dashboard/settings", req.url);
    dest.searchParams.set("google", "error");
    dest.searchParams.set(
      "msg",
      error instanceof Error ? error.message : "OAuth error",
    );
    return NextResponse.redirect(dest);
  }
}
