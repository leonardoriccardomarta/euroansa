import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { downloadBlob } from "@/lib/storage/blob";

export const maxDuration = 60;

/** Download singolo documento (login CRM richiesto). */
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
    const { buffer, contentType } = await downloadBlob(doc.driveFileId);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${doc.renamedFileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("file download failed", documentId, err);
    return NextResponse.json(
      { error: "Download fallito" },
      { status: 500 },
    );
  }
}
