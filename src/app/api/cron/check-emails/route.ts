import { NextRequest, NextResponse } from "next/server";
import { eq, or, sql } from "drizzle-orm";
import {
  fetchPendingMortgageEmails,
  markMessageProcessed,
  unmarkMessageProcessed,
} from "@/lib/google/gmail";
import {
  ensureWaitingApplication,
  ingestEmailAttachmentsWithoutAi,
  isStaffMailboxEmail,
  processPendingDocumentAnalyses,
} from "@/lib/pipeline";
import {
  getGmailClient,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
  type GoogleOAuthClient,
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

/** Quanti messaggi elaborare al massimo per ciclo (mantiene l'ingestione sotto i 5s). */
const MAX_EMAILS_PER_ACCOUNT = 2;
/** Quanti file analizzare al massimo per ciclo con OCR/Gemini (chunking incrementale a step). */
const OCR_CHUNK_SIZE = 2;

/**
 * Fallback di recupero: sblocca eventuali mail di info.inzago@euroansa.it
 * che potrebbero essere state etichettate "MUTUO-ELABORATA" durante un timeout
 * prima che la pratica o i documenti venissero completati a DB.
 */
async function recoverBlockedEmails(googleAuth: GoogleOAuthClient) {
  try {
    const gmail = getGmailClient(googleAuth);
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "from:info.inzago@euroansa.it label:MUTUO-ELABORATA",
      maxResults: 5,
    });

    for (const msg of res.data.messages ?? []) {
      if (!msg.id) continue;

      const [appMatch] = await db
        .select({ id: applications.id })
        .from(applications)
        .where(
          or(
            sql`${msg.id} = ANY(${applications.emailThreadIds})`,
            eq(applications.clientEmail, "info.inzago@euroansa.it"),
          ),
        )
        .limit(1);

      let hasDocs = false;
      if (appMatch) {
        const [doc] = await db
          .select({ id: documents.id })
          .from(documents)
          .where(eq(documents.applicationId, appMatch.id))
          .limit(1);
        hasDocs = Boolean(doc);
      }

      if (!appMatch || !hasDocs) {
        console.warn(
          `[RECOVERY] Rimuovo etichetta MUTUO-ELABORATA dalla mail bloccata ${msg.id} di info.inzago@euroansa.it`,
        );
        await unmarkMessageProcessed(msg.id, googleAuth);
      }
    }
  } catch (err) {
    console.error("recoverBlockedEmails error:", err);
  }
}

/**
 * Flusso a due fasi (Step-by-step):
 * 1. Fase 1: Ingestione Mail rapida (< 5 secondi, ZERO AI sincrono)
 *    - Scarica allegati, carica grezzi su R2, crea pratica e documenti con stato 'pending' a DB
 *    - Applica label Gmail "MUTUO-ELABORATA" RIGOROSAMENTE DOPO che la pratica e i documenti sono a DB
 * 2. Fase 2: OCR a scaglioni (SOLO 1 o 2 file per esecuzione)
 *    - Prende in carico 1-2 documenti pendenti, esegue OCR/classificazione Gemini e aggiorna a 'done'
 *    - L'intera esecuzione richiede solo pochissimi secondi e non supererà mai il timeout di 60s
 */
async function runEmailCronWork(force: boolean) {
  const started = Date.now();
  const connectedUsers = await listConnectedGoogleUsers();

  if (connectedUsers.length === 0) {
    console.warn("cron check-emails: nessun account Google collegato");
    try {
      await syncOcrPendingFlagFromDb();
    } catch {
      // ignore
    }
    return {
      ok: false as const,
      reason: "no_connected_users",
      accountResults: [],
      analysis: null,
      elapsedMs: Date.now() - started,
    };
  }

  // Specchia hub su R2 per evitare risvegli Neon non necessari
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

  // =========================================================================
  // FASE 1: Ingestione rapida della posta (< 5s, ZERO chiamate AI/Gemini)
  // =========================================================================
  const accountResults = [];

  for (const owner of connectedUsers) {
    const googleAuth = oauthClientFromRefreshToken(owner.googleRefreshToken);

    // Controllo di fallback / sblocco mail info.inzago@euroansa.it
    await recoverBlockedEmails(googleAuth);

    const emails = await fetchPendingMortgageEmails(
      MAX_EMAILS_PER_ACCOUNT,
      force,
      googleAuth,
    );

    const results = [];

    for (const email of emails) {
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

        // Applica etichetta RIGOROSAMENTE DOPO il salvataggio a DB
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
        });
        continue;
      }

      // Ingestione rapida: salvataggio file grezzi su Cloudflare R2 e record 'pending' a DB
      const ingested = await ingestEmailAttachmentsWithoutAi(
        email.attachments.map((g) => ({
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

      // Applica etichetta "MUTUO-ELABORATA" RIGOROSAMENTE DOPO che la pratica e i documenti sono salvati a DB
      const dbSaved = Boolean(ingested.applicationId && (ingested.stored > 0 || ingested.skipped > 0));
      if (dbSaved) {
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
        totalAttachments: email.attachments.length,
        stored: ingested.stored,
        skipped: ingested.skipped,
        applicationIds: ingested.applicationId ? [ingested.applicationId] : [],
        errors: ingested.errors,
        labeled: dbSaved,
      });
    }

    accountResults.push({
      userId: owner.id,
      email: owner.googleEmail ?? owner.email,
      results,
    });
  }

  // =========================================================================
  // FASE 2: OCR a scaglioni incrementale (SOLO 1 o 2 file per esecuzione)
  // =========================================================================
  let analysis: Awaited<ReturnType<typeof processPendingDocumentAnalyses>> | null = null;
  try {
    analysis = await processPendingDocumentAnalyses(OCR_CHUNK_SIZE);
  } catch (ocrErr) {
    console.error("processPendingDocumentAnalyses error:", ocrErr);
  }

  try {
    await syncOcrPendingFlagFromDb();
  } catch (flagErr) {
    console.error("syncOcrPendingFlagFromDb", flagErr);
  }

  const elapsedMs = Date.now() - started;
  console.log("cron check-emails completed successfully", {
    elapsedMs,
    accounts: accountResults.length,
    ocrAttempted: analysis?.attempted ?? 0,
    ocrSucceeded: analysis?.succeeded ?? 0,
  });

  return {
    ok: true as const,
    elapsedMs,
    accountResults,
    analysis,
  };
}

/**
 * Gate di controllo con Neon DB: esegue l'aggiornamento schema e il lavoro a 2 fasi.
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
    console.error("gmail probe failed", err);
    ocrFlag = ocrFlag === false ? null : ocrFlag;
  }

  const wake = shouldWakeNeon({
    force,
    gmailMessageCount: gmailCount,
    ocrFlag,
  });

  if (!wake) {
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

  try {
    const result = await runCronWithNeonGate(force);
    return NextResponse.json(result);
  } catch (error) {
    console.error("cron check-emails error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/** cron-job.org / curl supportano GET e POST */
export const POST = GET;
