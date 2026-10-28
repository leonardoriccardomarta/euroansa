import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { loadPackageFileBuffer } from "@/lib/package-bundle";
import {
  clientSurnameShort,
  isEuroansaFolder,
  storageFolderKindForDocument,
} from "@/lib/config/documents";

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await params;
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);

  if (!app) {
    return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
  }

  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const folderParam = req.nextUrl.searchParams.get("folder")?.trim();

  const allDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.applicationId, id),
        eq(documents.filePurged, false),
      ),
    );

  let targetDocs = allDocs;
  if (folderParam && folderParam.toLowerCase() !== "all") {
    const fUpper = folderParam.toUpperCase();
    targetDocs = allDocs.filter((d) => {
      const sub = (d.storageSubfolder ?? "").trim();
      if (sub.toLowerCase() === folderParam.toLowerCase()) return true;

      const kind = storageFolderKindForDocument(d.documentType);
      if (fUpper === "DOC") {
        return kind === "DOC" || / DOC$/i.test(sub);
      }
      if (fUpper === "IMMOBILE") {
        return kind === "IMMOBILE" || sub.toUpperCase() === "IMMOBILE";
      }
      if (fUpper === "EUROANSA" || fUpper === "UFFICIO") {
        return kind === "EUROANSA" || isEuroansaFolder(sub);
      }
      if (fUpper === "BANCA") {
        return kind === "BANCA" || sub.toUpperCase() === "BANCA";
      }
      return false;
    });
  }

  if (targetDocs.length === 0) {
    return NextResponse.json(
      { error: "Nessun documento trovato nella cartella selezionata" },
      { status: 404 },
    );
  }

  const zip = new JSZip();
  let added = 0;
  const usedZipNames = new Set<string>();

  for (const doc of targetDocs) {
    if (!doc.driveFileId) continue;
    try {
      const buffer = await loadPackageFileBuffer(doc.driveFileId, app.brokerId);
      let targetName = (
        doc.renamedFileName ||
        doc.rawFileName ||
        `doc_${doc.id}.pdf`
      ).trim();
      if (!targetName.toLowerCase().endsWith(".pdf")) {
        targetName += ".pdf";
      }

      let zipName = targetName;
      let counter = 1;
      while (usedZipNames.has(zipName.toLowerCase())) {
        const dot = targetName.lastIndexOf(".");
        const stem = dot > 0 ? targetName.slice(0, dot) : targetName;
        const ext = dot > 0 ? targetName.slice(dot) : ".pdf";
        zipName = `${stem}_${counter}${ext}`;
        counter++;
      }
      usedZipNames.add(zipName.toLowerCase());

      zip.file(zipName, buffer);
      added++;
    } catch (err) {
      console.error("zip download error for document", doc.id, err);
    }
  }

  if (added === 0) {
    return NextResponse.json(
      { error: "Nessun file scaricabile al momento" },
      { status: 404 },
    );
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const surname = clientSurnameShort(app.clientName) || "CLIENTE";
  let zipFileName: string;

  if (folderParam && folderParam.toLowerCase() !== "all") {
    // Normalizza etichetta cartella: es. "SINGH DOC" -> "DOC" o "Euroansa" -> "Euroansa"
    let cleanFolder = folderParam
      .replace(/ DOC$/i, "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!cleanFolder || cleanFolder === surname) {
      cleanFolder = "Documenti";
    }
    zipFileName = `${surname}_${cleanFolder}.zip`;
  } else {
    // Intero dossier: Dossier_[COGNOME]_[NOME].zip
    const cleanParts = app.clientName
      .trim()
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .split(/\s+/);
    const cognome = cleanParts[0] || "CLIENTE";
    const nome = cleanParts.slice(1).join("_") || "PRATICA";
    zipFileName = `Dossier_${cognome}_${nome}.zip`;
  }

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
