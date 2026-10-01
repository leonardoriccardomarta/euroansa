import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import {
  fetchPendingMortgageEmails,
  markMessageProcessed,
} from "@/lib/google/gmail";
import { processIncomingFiles } from "@/lib/pipeline";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";

export const maxDuration = 60;

async function alreadyProcessedFileNames(fromEmail: string): Promise<Set<string>> {
  const openApps = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.clientEmail, fromEmail.toLowerCase()),
        or(
          eq(applications.status, "IN_ATTESA_DOCUMENTI"),
          eq(applications.status, "DOCUMENTI_INCOMPLETI"),
          eq(applications.status, "COMPLETA_DA_INOLTRARE"),
          eq(applications.status, "ANOMALIA"),
        ),
      ),
    );

  if (openApps.length === 0) return new Set();

  const rows = await db
    .select({ rawFileName: documents.rawFileName })
    .from(documents)
    .where(
      or(...openApps.map((a) => eq(documents.applicationId, a.id))),
    );

  return new Set(rows.map((r) => r.rawFileName));
}

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

      const done = await alreadyProcessedFileNames(first.fromEmail);
      const pending = group.filter((g) => !done.has(g.filename));

      // Free tier: max 3 allegati nuovi per email per run
      const batch = pending.slice(0, 3);

      if (batch.length === 0) {
        if (pending.length === 0 && group.length > 0) {
          try {
            await markMessageProcessed(messageId);
          } catch (labelError) {
            console.error("markMessageProcessed failed", messageId, labelError);
          }
        }
        results.push({
          messageId,
          skipped: group.length,
          pending: 0,
          processed: 0,
          applicationIds: [] as string[],
          errors: [] as string[],
        });
        continue;
      }

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

      const remainingAfter =
        pending.length - processed.processed + processed.errors.length;
      const fullyDone =
        processed.errors.length === 0 && remainingAfter <= 0;

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
        pendingBefore: pending.length,
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
