import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { downloadBlob } from "@/lib/storage/blob";

export const maxDuration = 60;

/** Download relazione broker (login CRM). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);

  if (!app?.relazioneStorageKey) {
    return NextResponse.json({ error: "Relazione non trovata" }, { status: 404 });
  }

  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { buffer, contentType } = await downloadBlob(app.relazioneStorageKey);
    const name = app.relazioneFileName ?? "relazione.pdf";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("relazione download failed", id, err);
    return NextResponse.json(
      { error: "Download fallito" },
      { status: 500 },
    );
  }
}
