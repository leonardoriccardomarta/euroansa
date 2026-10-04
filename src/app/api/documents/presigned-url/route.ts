import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createPresignedPutUrl } from "@/lib/storage/blob";

export const maxDuration = 30;

/**
 * URL firmato per PUT diretto browser → Cloudflare R2.
 * POST { applicationId, fileName, contentType }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    applicationId?: string;
    fileName?: string;
    contentType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  const applicationId = body.applicationId?.trim();
  const fileName = body.fileName?.trim();
  const contentType = body.contentType?.trim() || "application/octet-stream";
  if (!applicationId || !fileName) {
    return NextResponse.json(
      { error: "applicationId e fileName richiesti" },
      { status: 400 },
    );
  }

  const [app] = await db
    .select({
      id: applications.id,
      brokerId: applications.brokerId,
      isTest: applications.isTest,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) {
    return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
  }
  if (app.isTest && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const signed = await createPresignedPutUrl({
      applicationId,
      fileName,
      contentType,
    });
    return NextResponse.json({
      uploadUrl: signed.uploadUrl,
      storageKey: signed.storageKey,
    });
  } catch (err) {
    console.error("presigned-url failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Impossibile firmare upload R2",
      },
      { status: 500 },
    );
  }
}
