import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { getSession, canAccessApplication } from "@/lib/auth";
import { createPresignedGetUrl } from "@/lib/storage/blob";
import { resolveDocumentStorageKey } from "@/lib/storage/paths";

export const maxDuration = 30;

/**
 * Accesso e download documento: auth CRM → redirect a URL firmato Cloudflare R2 (expiresIn: 600).
 * Supporta pratiche storiche e completate (ROGITATA) senza blocchi di stato.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;
  const targetId =
    documentId === "download"
      ? req.nextUrl.searchParams.get("id") ||
        req.nextUrl.searchParams.get("documentId")
      : documentId;

  let doc = null;
  if (targetId && targetId !== "download") {
    const [found] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, targetId))
      .limit(1);
    doc = found;
  } else if (documentId === "download") {
    const keyParam = req.nextUrl.searchParams.get("key");
    if (keyParam) {
      const [found] = await db
        .select()
        .from(documents)
        .where(eq(documents.driveFileId, keyParam))
        .limit(1);
      doc = found;
    }
  }

  if (!doc) {
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, doc.applicationId))
    .limit(1);

  if (!app) {
    return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
  }

  // Verifica policy: operatori accreditati (info.inzago@euroansa.it), admin o pratiche storiche (ROGITATA)
  if (!canAccessApplication(session, app)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storageKey = resolveDocumentStorageKey(doc);
  if (!storageKey) {
    return NextResponse.json(
      {
        error: doc.filePurged
          ? "File rimosso dallo storage (resta solo lo storico)"
          : "File non presente su storage R2",
      },
      { status: doc.filePurged ? 410 : 404 },
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const isDownload =
    searchParams.get("download") === "1" ||
    searchParams.get("download") === "true";
  const wantsJson =
    searchParams.get("json") === "1" ||
    searchParams.get("json") === "true" ||
    req.headers.get("accept")?.includes("application/json");

  try {
    const fileName = doc.renamedFileName || doc.rawFileName || "documento.pdf";
    const url = await createPresignedGetUrl(storageKey, 600, {
      fileName,
      download: isDownload,
    });

    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        url,
        fileName,
        documentId: doc.id,
      });
    }

    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("file presign failed", documentId, err);
    return NextResponse.json(
      { error: "Generazione URL firmato fallita dallo storage sito" },
      { status: 500 },
    );
  }
}
