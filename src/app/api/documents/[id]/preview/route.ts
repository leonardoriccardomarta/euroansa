import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { getSession, canAccessApplication } from "@/lib/auth";
import { createPresignedGetUrl } from "@/lib/storage/blob";
import { resolveDocumentStorageKey } from "@/lib/storage/paths";

export const maxDuration = 30;

/**
 * Anteprima documento: genera URL firmato Cloudflare R2 con ResponseContentDisposition: 'inline'.
 * Valido 600 secondi (10 minuti) via @aws-sdk/s3-request-presigner.
 * Nessuna restrizione per pratiche concluse o archiviate (status ROGITATA).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Ricerca documento per ID documento
  let [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  // Fallback: se l'id passato è l'id della pratica, prendi il primo documento
  if (!doc) {
    const [firstDoc] = await db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, id))
      .limit(1);
    if (firstDoc) {
      doc = firstDoc;
    }
  }

  if (!doc) {
    return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, doc.applicationId))
    .limit(1);

  if (!app) {
    return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
  }

  // Verifica policy: operatori whitelisted (info.inzago@euroansa.it), admin e pratiche ROGITATE
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
  const wantsJson =
    searchParams.get("json") === "1" ||
    searchParams.get("json") === "true" ||
    req.headers.get("accept")?.includes("application/json");

  try {
    const fileName = doc.renamedFileName || doc.rawFileName || "documento.pdf";
    const url = await createPresignedGetUrl(storageKey, 600, {
      fileName,
      download: false, // inline preview
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
    console.error("document preview presign failed", id, err);
    return NextResponse.json(
      { error: "Generazione URL anteprima fallita dallo storage R2" },
      { status: 500 },
    );
  }
}
