import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agencyResources } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { downloadBlob } from "@/lib/storage/blob";

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
  const [row] = await db
    .select()
    .from(agencyResources)
    .where(eq(agencyResources.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { buffer, contentType } = await downloadBlob(row.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.mimeType || contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.fileName)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("resource download", err);
    return NextResponse.json({ error: "File non disponibile" }, { status: 404 });
  }
}
