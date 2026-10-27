import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { getSession, canAccessApplication } from "@/lib/auth";
import { downloadBlob } from "@/lib/storage/blob";
import { isSiteStorageKey } from "@/lib/storage/paths";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAccessApplication(session, app)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!app.preventivoStorageKey || !isSiteStorageKey(app.preventivoStorageKey)) {
    return NextResponse.json({ error: "Preventivo assente" }, { status: 404 });
  }

  try {
    const { buffer, contentType } = await downloadBlob(app.preventivoStorageKey);
    const name = app.preventivoFileName ?? "preventivo.pdf";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType || "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("preventivo download", err);
    return NextResponse.json({ error: "File non disponibile" }, { status: 404 });
  }
}
