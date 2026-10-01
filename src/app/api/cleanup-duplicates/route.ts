import { NextRequest, NextResponse } from "next/server";
import { mergeAllDuplicateApplications } from "@/lib/pipeline";

export const maxDuration = 60;

/**
 * Cleanup doppioni pratiche (stessa email).
 * POST /api/cleanup-duplicates
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await mergeAllDuplicateApplications();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("cleanup-duplicates error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Cleanup failed",
      },
      { status: 500 },
    );
  }
}
