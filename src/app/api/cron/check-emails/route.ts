import { NextRequest, NextResponse } from "next/server";
import { fetchPendingMortgageEmails } from "@/lib/google/gmail";
import { processIncomingFiles } from "@/lib/pipeline";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const attachments = await fetchPendingMortgageEmails(5);

    // Raggruppa per messageId per processare
    const byMessage = new Map<string, typeof attachments>();
    for (const att of attachments) {
      const list = byMessage.get(att.messageId) ?? [];
      list.push(att);
      byMessage.set(att.messageId, list);
    }

    const results = [];
    for (const [, group] of byMessage) {
      const first = group[0];
      const processed = await processIncomingFiles(
        group.map((g) => ({
          buffer: g.buffer,
          mimeType: g.mimeType,
          originalFileName: g.filename,
          clientEmail: first.fromEmail,
          clientNameHint: first.fromEmail.split("@")[0],
        })),
      );
      results.push(processed);
    }

    return NextResponse.json({
      ok: true,
      emails: byMessage.size,
      attachments: attachments.length,
      results,
    });
  } catch (error) {
    console.error("cron check-emails error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
