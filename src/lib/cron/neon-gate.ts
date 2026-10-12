/**
 * Evita di svegliare Neon quando il cron non ha lavoro.
 * - Token Google hub su R2 (o GOOGLE_REFRESH_TOKEN) → check Gmail senza DB
 * - Flag coda OCR su R2 → so se c’è OCR pending senza query Neon
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import {
  deleteSystemBlob,
  getSystemBlob,
  putSystemBlob,
} from "@/lib/storage/blob";
import { oauthClientFromRefreshToken, type GoogleOAuthClient } from "@/lib/google/auth";

const OCR_FLAG_KEY = "_system/ocr-pending.json";
const GOOGLE_HUB_KEY = "_system/google-hub.json";

type OcrFlag = { pending: boolean; updatedAt: string };
type GoogleHubBlob = {
  refreshToken: string;
  userId?: string;
  googleEmail?: string | null;
  updatedAt: string;
};

/** true / false noti; null = mai sincronizzato → apri Neon una volta. */
export async function readOcrPendingFlag(): Promise<boolean | null> {
  const blob = await getSystemBlob(OCR_FLAG_KEY);
  if (!blob) return null;
  try {
    const data = JSON.parse(blob.buffer.toString("utf8")) as OcrFlag;
    return Boolean(data.pending);
  } catch {
    return null;
  }
}

export async function setOcrPendingFlag(pending: boolean): Promise<void> {
  const payload: OcrFlag = {
    pending,
    updatedAt: new Date().toISOString(),
  };
  await putSystemBlob(OCR_FLAG_KEY, JSON.stringify(payload));
}

/** Dopo lavoro Neon: allinea il flag a pending/failed/processing reali. */
export async function syncOcrPendingFlagFromDb(): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        inArray(documents.analysisStatus, [
          "pending",
          "failed",
          "processing",
        ]),
        eq(documents.filePurged, false),
      ),
    )
    .limit(1);
  const pending = Boolean(row);
  await setOcrPendingFlag(pending);
  return pending;
}

export async function markOcrPending(): Promise<void> {
  await setOcrPendingFlag(true);
}

export async function saveGoogleHubToR2(params: {
  refreshToken: string;
  userId?: string;
  googleEmail?: string | null;
}): Promise<void> {
  const payload: GoogleHubBlob = {
    refreshToken: params.refreshToken,
    userId: params.userId,
    googleEmail: params.googleEmail ?? null,
    updatedAt: new Date().toISOString(),
  };
  await putSystemBlob(GOOGLE_HUB_KEY, JSON.stringify(payload));
}

export async function clearGoogleHubFromR2(): Promise<void> {
  try {
    await deleteSystemBlob(GOOGLE_HUB_KEY);
  } catch {
    // ignore
  }
}

/** Refresh token senza Neon: env → R2. */
export async function getCronGoogleRefreshToken(): Promise<string | null> {
  const fromEnv = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const blob = await getSystemBlob(GOOGLE_HUB_KEY);
  if (!blob) return null;
  try {
    const data = JSON.parse(blob.buffer.toString("utf8")) as GoogleHubBlob;
    return data.refreshToken?.trim() || null;
  } catch {
    return null;
  }
}

export async function getCronGoogleAuth(): Promise<GoogleOAuthClient | null> {
  const token = await getCronGoogleRefreshToken();
  if (!token) return null;
  return oauthClientFromRefreshToken(token);
}

/**
 * Serve aprire Neon?
 * - force
 * - mail in coda Gmail
 * - flag OCR true
 * - flag OCR null (bootstrap / mai sync)
 */
export function shouldWakeNeon(params: {
  force: boolean;
  gmailMessageCount: number;
  ocrFlag: boolean | null;
}): boolean {
  if (params.force) return true;
  if (params.gmailMessageCount > 0) return true;
  if (params.ocrFlag === null) return true;
  if (params.ocrFlag === true) return true;
  return false;
}
