import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { downloadBlob } from "@/lib/storage/blob";

export const maxDuration = 60;

/**
 * Download ZIP pacchetto pratica per segreteria (token, senza login CRM).
 * GET /api/packages/[id]?t=TOKEN
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("t")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 401 });
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);

  if (!app || !app.packageToken || app.packageToken !== token) {
    return NextResponse.json({ error: "Link non valido" }, { status: 403 });
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, id));

  const zip = new JSZip();
  const root = app.clientName.replace(/[\\/]+/g, " ").trim() || "Pratica";

  for (const doc of docs) {
    if (!doc.isValid || !doc.driveFileId) continue;
    try {
      const { buffer } = await downloadBlob(doc.driveFileId);
      const folder = doc.storageSubfolder || "DOC";
      zip.file(`${root}/${folder}/${doc.renamedFileName}`, buffer);
    } catch (err) {
      console.error("package zip doc failed", doc.id, err);
    }
  }

  if (app.relazioneStorageKey) {
    try {
      const { buffer } = await downloadBlob(app.relazioneStorageKey);
      const name = app.relazioneFileName ?? `${root}_relazione.pdf`;
      zip.file(`${root}/${name}`, buffer);
    } catch (err) {
      console.error("package zip relazione failed", err);
    }
  }

  const files = Object.keys(zip.files).filter((k) => !zip.files[k]?.dir);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Nessun file disponibile nel pacchetto" },
      { status: 404 },
    );
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const safeName = root.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "pratica";
  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}_pacchetto.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
