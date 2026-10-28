import { NextRequest, NextResponse, after } from "next/server";
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
import { ensureSchema } from "@/lib/db/ensure-schema";
import {
  getCronGoogleAuth,
  readOcrPendingFlag,
  saveGoogleHubToR2,
  shouldWakeNeon,
  syncOcrPendingFlagFromDb,
} from "@/lib/cron/neon-gate";

export const maxDuration = 60;

/**
 * Lavoro reale dopo il 200: cron-job.org free taglia a ~30s,
 * Vercel tiene viva la function fino a maxDuration via after()/waitUntil.
 */
const WORK_BUDGET_MS = 55_000;
const MAX_EMAILS_PER_ACCOUNT = 2;
const MAX_ATTACHMENTS_PER_MAIL = 12;
/** Quanti OCR tentare per run (si ferma prima se finisce il budget). */
const MAX_ANALYSES_PER_RUN = 4;

const OPEN_STATUSES = ["DOCUMENTI_INCOMPLETI", "COMPLETA_DA_INOLTRARE"] as const;

async function alreadyProcessedFileNames(
  fromEmail: string,
  messageId?: string,
): Promise<Set<string>> {
  await mergeDuplicateOpenApplicationsByEmail(fromEmail);

  const staff = await isStaffMailboxEmail(fromEmail);
  if (staff && messageId) {
    const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
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

async function runEmailCronWork(force: boolean) {
  const started = Date.now();
  const withinBudget = () => Date.now() - started < WORK_BUDGET_MS;

  try {
    await mergeAllDuplicateApplications();
  } catch (mergeErr) {
    console.error("mergeAllDuplicateApplications", mergeErr);
  }

  // 1) Prima la coda OCR (file già su R2) — sblocca checklist
  let analysis: Awaited<
    ReturnType<typeof processPendingDocumentAnalyses>
  > | null = null;
  if (withinBudget()) {
    analysis = await processPendingDocumentAnalyses(MAX_ANALYSES_PER_RUN);
  }

  const connectedUsers = await listConnectedGoogleUsers();
  if (connectedUsers.length === 0) {
    console.warn("cron check-emails: nessun Google collegato");
    try {
      await syncOcrPendingFlagFromDb();
    } catch {
      // ignore
    }
    return { analysis, accountResults: [], ok: false as const, neon: true };
  }

  // Specchia hub su R2 così i prossimi tick Gmail non toccano Neon
  const hub = connectedUsers[0]!;
  try {
    await saveGoogleHubToR2({
      refreshToken: hub.googleRefreshToken,
      userId: hub.id,
      googleEmail: hub.googleEmail,
    });
  } catch (hubErr) {
    console.error("saveGoogleHubToR2 from cron", hubErr);
  }

  const accountResults = [];

  // 2) Intake mail → R2 pending (niente Gemini qui)
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
          threadId: email.threadId,
          inReplyTo: email.inReplyTo,
          references: email.references,
          subject: email.subject,
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
      email: owner.googleEmail ?? owner.email,
      results,
    });
  }

  // 3) Ancora OCR se resta budget (file appena messi in coda)
  let analysisAfter: Awaited<
    ReturnType<typeof processPendingDocumentAnalyses>
  > | null = null;
  if (withinBudget()) {
    analysisAfter = await processPendingDocumentAnalyses(MAX_ANALYSES_PER_RUN);
  }

  try {
    await syncOcrPendingFlagFromDb();
  } catch (flagErr) {
    console.error("syncOcrPendingFlagFromDb end", flagErr);
  }

  console.log("cron check-emails done", {
    elapsedMs: Date.now() - started,
    analysis,
    analysisAfter,
    accounts: accountResults.length,
    neon: true,
  });

  return {
    ok: true as const,
    elapsedMs: Date.now() - started,
    analysis,
    analysisAfter,
    accountResults,
    neon: true,
  };
}

/**
 * Gate senza Neon: Gmail (token R2/env) + flag OCR su R2.
 * Solo se c’è lavoro (o force / flag sconosciuto) → ensureSchema + pipeline.
 */
async function runCronWithNeonGate(force: boolean) {
  const started = Date.now();

  let gmailCount = 0;
  let ocrFlag: boolean | null = null;
  let probeError: string | null = null;

  try {
    ocrFlag = await readOcrPendingFlag();
  } catch (err) {
    probeError = err instanceof Error ? err.message : String(err);
    console.error("readOcrPendingFlag", err);
    // In dubbio: apri Neon (non perdere OCR)
    ocrFlag = null;
  }

  try {
    const auth = await getCronGoogleAuth();
    if (auth) {
      const emails = await fetchPendingMortgageEmails(
        MAX_EMAILS_PER_ACCOUNT,
        force,
        auth,
      );
      gmailCount = emails.length;
    } else {
      // Nessun token fuori Neon → serve DB per hub, oppure idle se flag false
      if (ocrFlag !== false || force) {
        const schema = await ensureSchema();
        if (!schema.ok) {
          return {
            ok: false as const,
            error: schema.error ?? "Schema DB non aggiornato",
            neon: true,
          };
        }
        return await runEmailCronWork(force);
      }
      console.log("cron check-emails idle (no google token outside neon, ocr=false)", {
        elapsedMs: Date.now() - started,
      });
      return {
        ok: true as const,
        skipped: "idle" as const,
        reason: "no_token_ocr_clear",
        neon: false,
        elapsedMs: Date.now() - started,
      };
    }
  } catch (err) {
    probeError = err instanceof Error ? err.message : String(err);
    console.error("gmail probe without neon failed", err);
    // Probe fallita → meglio aprire Neon che perdere mail
    ocrFlag = ocrFlag === false ? null : ocrFlag;
  }

  const wake = shouldWakeNeon({
    force,
    gmailMessageCount: gmailCount,
    ocrFlag,
  });

  if (!wake) {
    console.log("cron check-emails idle (no neon)", {
      gmailCount,
      ocrFlag,
      elapsedMs: Date.now() - started,
    });
    return {
      ok: true as const,
      skipped: "idle" as const,
      gmailCount,
      ocrFlag,
      neon: false,
      elapsedMs: Date.now() - started,
      probeError,
    };
  }

  const schema = await ensureSchema();
  if (!schema.ok) {
    return {
      ok: false as const,
      error: schema.error ?? "Schema DB non aggiornato",
      neon: true,
    };
  }

  const result = await runEmailCronWork(force);
  return { ...result, probeError, gmailProbeCount: gmailCount, ocrFlag };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force =
    req.nextUrl.searchParams.get("force") === "1" ||
    req.nextUrl.searchParams.get("force") === "true";

  // Rispondi subito a cron-job.org; il lavoro continua su Vercel (maxDuration).
  after(async () => {
    try {
      await runCronWithNeonGate(force);
    } catch (error) {
      console.error("cron check-emails background error", error);
    }
  });

  return NextResponse.json({
    ok: true,
    accepted: true,
    mode: "background",
    force,
    neonGate: true,
  });
}

/** cron-job.org / curl possono usare GET o POST */
export const POST = GET;
