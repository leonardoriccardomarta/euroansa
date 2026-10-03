import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  getPackageBundle,
  loadPackageFileBuffer,
} from "@/lib/package-bundle";

export const maxDuration = 60;

/**
 * ZIP piatto (solo file rinominati, niente cartelle) — tipo WeTransfer.
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

  const bundle = await getPackageBundle(id, token);
  if (!bundle) {
    return NextResponse.json({ error: "Link non valido" }, { status: 403 });
  }

  const { app, files } = bundle;
  if (files.length === 0) {
    return new NextResponse(
      "Nessun file disponibile. Ricarica i documenti nella sezione File e riprova.",
      {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  const zip = new JSZip();
  let added = 0;

  for (const file of files) {
    try {
      const buffer = await loadPackageFileBuffer(file.storageKey, app.brokerId);
      zip.file(file.name, buffer);
      added += 1;
    } catch (err) {
      console.error("package zip file failed", file.name, err);
    }
  }

  if (added === 0) {
    return new NextResponse(
      "Nessun file scaricabile. Ricarica i documenti nella sezione File e riprova.",
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

  const safeName =
    app.clientName.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "pratica";

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}_documenti.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
