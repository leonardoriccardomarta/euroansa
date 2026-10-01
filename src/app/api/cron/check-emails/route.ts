import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import {
  fetchPendingMortgageEmails,
  markMessageProcessed,
} from "@/lib/google/gmail";
import {
  ensureWaitingApplication,
  processIncomingFiles,
} from "@/lib/pipeline";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";

export const maxDuration = 60;

async function alreadyProcessedFileNames(
  fromEmail: string,
): Promise<Set<string>> {
  const openApps = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.clientEmail, fromEmail.toLowerCase()),
        or(
          eq(applications.status, "DOCUMENTI_INCOMPLETI"),
          eq(applications.status, "COMPLETA_DA_INOLTRARE"),
        ),
      ),
    );

  if (openApps.length === 0) return new Set();

  const rows = await db
    .select({ rawFileName: documents.rawFileName })
    .from(documents)
    .where(or(...openApps.map((a) => eq(documents.applicationId, a.id))));

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

    const emails = await fetchPendingMortgageEmails(5, force);
    const results = [];

    for (const email of emails) {
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const isTest = Boolean(
        adminEmail && email.fromEmail.toLowerCase() === adminEmail,
      );

      // Mail corretta senza allegati → pratica documenti incompleti (0/n)
      if (email.attachments.length === 0) {
        const app = await ensureWaitingApplication({
          email: email.fromEmail,
          clientNameHint: email.fromEmail.split("@")[0],
          isTest,
        });
        try {
          await markMessageProcessed(email.messageId);
        } catch (labelError) {
          console.error(
            "markMessageProcessed failed",
            email.messageId,
            labelError,
          );
        }
        results.push({
          messageId: email.messageId,
          noAttachments: true,
          processed: 0,
          applicationIds: [app.id],
          errors: [] as string[],
        });
        continue;
      }

      const done = await alreadyProcessedFileNames(email.fromEmail);
      const pending = email.attachments.filter((g) => !done.has(g.filename));
      const batch = pending.slice(0, 3);

      if (batch.length === 0) {
        if (pending.length === 0) {
          try {
            await markMessageProcessed(email.messageId);
          } catch (labelError) {
            console.error(
              "markMessageProcessed failed",
              email.messageId,
              labelError,
            );
          }
        }
        results.push({
          messageId: email.messageId,
          skipped: email.attachments.length,
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
          clientEmail: email.fromEmail,
          clientNameHint: email.fromEmail.split("@")[0],
        })),
        { isTest },
      );

      const remainingAfter =
        pending.length - processed.processed + processed.errors.length;
      const fullyDone =
        processed.errors.length === 0 && remainingAfter <= 0;

      if (fullyDone) {
        try {
          await markMessageProcessed(email.messageId);
        } catch (labelError) {
          console.error(
            "markMessageProcessed failed",
            email.messageId,
            labelError,
          );
        }
      }

      results.push({
        messageId: email.messageId,
        batchSize: batch.length,
        pendingBefore: pending.length,
        totalAttachments: email.attachments.length,
        ...processed,
      });
    }

    return NextResponse.json({
      ok: true,
      force,
      emails: emails.length,
      attachments: emails.reduce((n, e) => n + e.attachments.length, 0),
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
