import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "euroansa_session";

export const ALLOWED_EMAILS = [
  "info.inzago@euroansa.it",
  "martaleo110@gmail.com",
  "aiorchestratoor@gmail.com",
  "leonardoriccar.marta01@universitadipavia.it",
];

function isEmailAuthorized(email?: string | null): boolean {
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets and internal next paths
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  // Public pages
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/package/")
  ) {
    return NextResponse.next();
  }

  // Public API endpoints
  if (
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/google/callback") ||
    pathname.startsWith("/api/google/connect") ||
    pathname.startsWith("/api/packages") ||
    pathname.startsWith("/api/share")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.AUTH_SECRET?.trim();

  // Protected API routes
  if (pathname.startsWith("/api/")) {
    if (!token || !secret) {
      return NextResponse.json(
        { error: "Accesso non autorizzato" },
        { status: 403 },
      );
    }

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
      );
      const email = String(payload.email || "");
      if (!isEmailAuthorized(email)) {
        return NextResponse.json(
          { error: "Accesso non autorizzato" },
          { status: 403 },
        );
      }
      return NextResponse.next();
    } catch {
      return NextResponse.json(
        { error: "Accesso non autorizzato" },
        { status: 403 },
      );
    }
  }

  // Protected Dashboard pages & root
  if (pathname.startsWith("/dashboard") || pathname === "/") {
    if (!token || !secret) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
      );
      const email = String(payload.email || "");
      if (!isEmailAuthorized(email)) {
        return NextResponse.redirect(new URL("/login?error=unauthorized", req.url));
      }
      if (pathname === "/") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/api/:path*",
    "/login",
    "/privacy",
    "/terms",
  ],
};
