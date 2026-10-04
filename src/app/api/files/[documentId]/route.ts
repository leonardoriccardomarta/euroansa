import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createPresignedGetUrl } from "@/lib/storage/blob";
import { isLegacyDriveKey, isSiteStorageKey } from "@/lib/storage/paths";

export const maxDuration = 30;

/** Apre il documento: auth CRM → redirect a URL firmato R2 (niente proxy byte su Vercel). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc || !doc.driveFileId) {
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }

  if (isLegacyDriveKey(doc.driveFileId) || !isSiteStorageKey(doc.driveFileId)) {
    return NextResponse.json(
      {
        error:
          "File ancora su Drive: sostituiscilo o ricaricalo nella sezione File (storage sito)",
      },
      { status: 409 },
    );
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, doc.applicationId))
    .limit(1);

  if (!app) {
    return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
  }

  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = await createPresignedGetUrl(doc.driveFileId, 900, {
      fileName: doc.renamedFileName,
    });
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("file presign failed", documentId, err);
    return NextResponse.json(
      { error: "Download fallito dallo storage sito" },
      { status: 500 },
    );
  }
}
