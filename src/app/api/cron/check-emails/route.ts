import { NextRequest, NextResponse } from "next/server";
import {
  fetchPendingMortgageEmails,
  markMessageProcessed,
} from "@/lib/google/gmail";
import { processIncomingFiles } from "@/lib/pipeline";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const force =
      req.nextUrl.searchParams.get("force") === "1" ||
      req.nextUrl.searchParams.get("force") === "true";

    const attachments = await fetchPendingMortgageEmails(5, force);

    // Raggruppa per messageId per processare
    const byMessage = new Map<string, typeof attachments>();
    for (const att of attachments) {
      const list = byMessage.get(att.messageId) ?? [];
      list.push(att);
      byMessage.set(att.messageId, list);
    }

    const results = [];
    for (const [messageId, group] of byMessage) {
      const first = group[0];
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const isTest = Boolean(
        adminEmail && first.fromEmail.toLowerCase() === adminEmail,
      );

      // Free tier Gemini ~5 req/min: max 3 allegati per email per run
      const batch = group.slice(0, 3);

      const processed = await processIncomingFiles(
        batch.map((g) => ({
          buffer: g.buffer,
          mimeType: g.mimeType,
          originalFileName: g.filename,
          clientEmail: first.fromEmail,
          clientNameHint: first.fromEmail.split("@")[0],
        })),
        { isTest },
      );

      const fullyDone =
        processed.errors.length === 0 &&
        processed.processed === batch.length &&
        batch.length === group.length;

      if (fullyDone) {
        try {
          await markMessageProcessed(messageId);
        } catch (labelError) {
          console.error("markMessageProcessed failed", messageId, labelError);
        }
      }

      results.push({
        messageId,
        batchSize: batch.length,
        totalAttachments: group.length,
        ...processed,
      });
    }

    return NextResponse.json({
      ok: true,
      force,
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
