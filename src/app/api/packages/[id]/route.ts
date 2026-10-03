import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { downloadBlob } from "@/lib/storage/blob";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { downloadFileFromDrive } from "@/lib/google/drive";

export const maxDuration = 60;

function looksLikeBlobPath(key: string): boolean {
  return (
    key.startsWith("practices/") ||
    key.includes("/") ||
    key.startsWith("http://") ||
    key.startsWith("https://")
  );
}

async function loadFileBuffer(
  storageKey: string,
  brokerId: string | null,
): Promise<Buffer> {
  if (looksLikeBlobPath(storageKey)) {
    const { buffer } = await downloadBlob(storageKey);
    return buffer;
  }

  // Legacy: ID Google Drive (pratiche create prima dello storage sito)
  let auth;
  if (brokerId) {
    try {
      auth = await getGoogleAuthForUser(brokerId);
    } catch {
      // fall through
    }
  }
  if (!auth) {
    const connected = await listConnectedGoogleUsers();
    if (!connected[0]) {
      throw new Error("File legacy Drive: Google non collegato");
    }
    auth = oauthClientFromRefreshToken(connected[0].googleRefreshToken);
  }
  const downloaded = await downloadFileFromDrive(storageKey, auth);
  return downloaded.buffer;
}

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
  let added = 0;

  for (const doc of docs) {
    if (!doc.isValid || !doc.driveFileId) continue;
    try {
      const buffer = await loadFileBuffer(doc.driveFileId, app.brokerId);
      const folder = doc.storageSubfolder || "DOC";
      zip.file(`${root}/${folder}/${doc.renamedFileName}`, buffer);
      added += 1;
    } catch (err) {
      console.error("package zip doc failed", doc.id, doc.driveFileId, err);
    }
  }

  if (app.relazioneStorageKey) {
    try {
      const buffer = await loadFileBuffer(
        app.relazioneStorageKey,
        app.brokerId,
      );
      const name = app.relazioneFileName ?? `${root}_relazione.pdf`;
      zip.file(`${root}/${name}`, buffer);
      added += 1;
    } catch (err) {
      console.error("package zip relazione failed", err);
    }
  }

  if (added === 0) {
    return new NextResponse(
      "Nessun file scaricabile. Ricarica i documenti nella sezione File del sito e riprova.",
      {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
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
