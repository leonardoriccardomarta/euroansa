import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  fetchPendingMortgageEmails,
  markMessageProcessed,
} from "@/lib/google/gmail";
import {
  ensureWaitingApplication,
  ingestEmailAttachmentsWithoutAi,
  isStaffMailboxEmail,
  mergeAllDuplicateApplications,
  mergeDuplicateOpenApplicationsByEmail,
  processPendingDocumentAnalyses,
} from "@/lib/pipeline";
import {
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";

export const maxDuration = 60;

/** cron-job.org free ≈ 30s: lascia margine per rispondere 200. */
const TIME_BUDGET_MS = 25_000;
const MAX_EMAILS_PER_ACCOUNT = 3;
/** Allegati da scaricare/salvare per mail (resto al minuto dopo). */
const MAX_ATTACHMENTS_PER_MAIL = 12;
/** OCR Gemini per run (1 file ≈ spesso 10–20s). */
const MAX_ANALYSES_PER_RUN = 1;

const OPEN_STATUSES = ["DOCUMENTI_INCOMPLETI", "COMPLETA_DA_INOLTRARE"] as const;

async function alreadyProcessedFileNames(
  fromEmail: string,
  messageId?: string,
): Promise<Set<string>> {
  await mergeDuplicateOpenApplicationsByEmail(fromEmail);

  const staff = await isStaffMailboxEmail(fromEmail);
  if (staff && messageId) {
    const safeId = messageId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
    const stagingEmail = `intake.${safeId || "x"}@prontopratica.local`;
    const [staging] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.clientEmail, stagingEmail))
      .limit(1);
    if (!staging) return new Set();
    const rows = await db
      .select({ rawFileName: documents.rawFileName })
      .from(documents)
      .where(eq(documents.applicationId, staging.id));
    return new Set(rows.map((r) => r.rawFileName));
  }

  const openApps = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.clientEmail, fromEmail.toLowerCase()),
        inArray(applications.status, [...OPEN_STATUSES]),
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
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const withinBudget = () => Date.now() - started < TIME_BUDGET_MS;

  try {
    const force =
      req.nextUrl.searchParams.get("force") === "1" ||
      req.nextUrl.searchParams.get("force") === "true";

    const connectedUsers = await listConnectedGoogleUsers();
    if (connectedUsers.length === 0) {
      return NextResponse.json({
        ok: false,
        error:
          "Nessun utente con Google collegato. Impostazioni → Collega Google (o GOOGLE_REFRESH_TOKEN legacy).",
      });
    }

    try {
      await mergeAllDuplicateApplications();
    } catch (mergeErr) {
      console.error("mergeAllDuplicateApplications", mergeErr);
    }

    const accountResults = [];

    // 1) Intake veloce: Gmail → R2 + doc pending (niente Gemini)
    for (const owner of connectedUsers) {
      if (!withinBudget()) break;

      const googleAuth = oauthClientFromRefreshToken(owner.googleRefreshToken);
      const emails = await fetchPendingMortgageEmails(
        MAX_EMAILS_PER_ACCOUNT,
        force,
        googleAuth,
      );
      const results = [];

      for (const email of emails) {
        if (!withinBudget()) break;

        await mergeDuplicateOpenApplicationsByEmail(email.fromEmail);

        if (email.attachments.length === 0) {
          const staff = await isStaffMailboxEmail(email.fromEmail);
          let appId: string | null = null;
          if (!staff) {
            const app = await ensureWaitingApplication({
              email: email.fromEmail,
              clientNameHint: email.fromEmail.split("@")[0],
              isTest: false,
              brokerId: owner.id,
            });
            appId = app.id;
          }
          try {
            await markMessageProcessed(email.messageId, googleAuth);
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
            stored: 0,
            applicationIds: appId ? [appId] : [],
            errors: [] as string[],
            skippedStaffNoAttachments: staff || undefined,
          });
          continue;
        }

        const done = await alreadyProcessedFileNames(
          email.fromEmail,
          email.messageId,
        );
        // Per staging staff i file sono sulla pratica intake.*: dedupe anche per raw name global pending
        const pending = email.attachments.filter((g) => !done.has(g.filename));
        const batch = pending.slice(0, MAX_ATTACHMENTS_PER_MAIL);

        if (batch.length === 0) {
          if (pending.length === 0) {
            try {
              await markMessageProcessed(email.messageId, googleAuth);
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
            stored: 0,
            applicationIds: [] as string[],
            errors: [] as string[],
          });
          continue;
        }

        const ingested = await ingestEmailAttachmentsWithoutAi(
          batch.map((g) => ({
            buffer: g.buffer,
            mimeType: g.mimeType,
            filename: g.filename,
          })),
          {
            fromEmail: email.fromEmail,
            messageId: email.messageId,
            clientNameHint: email.fromEmail.split("@")[0],
            isTest: false,
            brokerId: owner.id,
          },
        );

        const remainingAfter =
          pending.length - ingested.stored - ingested.skipped;
        const fullyIngested =
          ingested.errors.length === 0 && remainingAfter <= 0;

        if (fullyIngested) {
          try {
            await markMessageProcessed(email.messageId, googleAuth);
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
          stored: ingested.stored,
          skipped: ingested.skipped,
          applicationIds: ingested.applicationId
            ? [ingested.applicationId]
            : [],
          errors: ingested.errors,
          labeled: fullyIngested,
        });
      }

      accountResults.push({
        userId: owner.id,
        userEmail: owner.email,
        googleEmail: owner.googleEmail,
        emails: emails.length,
        attachments: emails.reduce((n, e) => n + e.attachments.length, 0),
        results,
      });
    }

    // 2) Coda OCR: 1 file se resta budget (prossimo minuto continua)
    let analysis: Awaited<
      ReturnType<typeof processPendingDocumentAnalyses>
    > | null = null;
    if (withinBudget()) {
      analysis = await processPendingDocumentAnalyses(MAX_ANALYSES_PER_RUN);
    }

    return NextResponse.json({
      ok: true,
      force,
      elapsedMs: Date.now() - started,
      accounts: accountResults.length,
      accountResults,
      analysis,
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

/** cron-job.org / curl possono usare GET o POST */
export const POST = GET;
