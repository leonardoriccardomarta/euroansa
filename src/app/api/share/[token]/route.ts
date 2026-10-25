import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { secretarySendLogs, applications } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Link scaduto o non valido" }), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [share] = await db
    .select({
      id: secretarySendLogs.id,
      applicationId: secretarySendLogs.applicationId,
      expiresAt: secretarySendLogs.packageExpiresAt,
    })
    .from(secretarySendLogs)
    .where(eq(secretarySendLogs.packageToken, token))
    .limit(1);

  const [appShare] = share
    ? [null]
    : await db
        .select({
          id: applications.id,
          applicationId: applications.id,
          expiresAt: applications.packageTokenExpiresAt,
        })
        .from(applications)
        .where(eq(applications.packageToken, token))
        .limit(1);

  const record = share ?? appShare;

  if (!record || !record.expiresAt || new Date() > new Date(record.expiresAt)) {
    return new Response(JSON.stringify({ error: "Link scaduto o non valido" }), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    });
  }

  return NextResponse.json({
    ok: true,
    applicationId: record.applicationId,
    expiresAt: record.expiresAt,
  });
}
