/**
 * Storage documenti su Cloudflare R2 (S3-compatible).
 * I pathname restano `practices/{id}/...` come prima (compat DB).
 */
import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StoredBlob = {
  pathname: string;
  url: string;
};

/** Endpoint account-only (no /bucket). Virtual-host bucket.account.r2… rompe TLS. */
function resolveR2Endpoint(accountId?: string, rawEndpoint?: string): string | undefined {
  let endpoint =
    rawEndpoint?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint) return undefined;

  // Se in env è stata incollata l'S3 API URL completa …/euroansa → togli il path
  try {
    const u = new URL(endpoint);
    endpoint = `${u.protocol}//${u.host}`;
  } catch {
    endpoint = endpoint.replace(/\/+$/, "");
  }
  return endpoint;
}

function requireR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const endpoint = resolveR2Endpoint(
    accountId,
    process.env.R2_ENDPOINT?.trim(),
  );

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 non configurato: imposta R2_ACCOUNT_ID (o R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME",
    );
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

const globalR2 = globalThis as unknown as { __prontopraticaR2?: S3Client };

function getR2Client() {
  if (globalR2.__prontopraticaR2) return globalR2.__prontopraticaR2;
  const { endpoint, accessKeyId, secretAccessKey } = requireR2Config();
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // Obbligatorio: altrimenti SDK usa euroansa.<account>.r2… → SSL handshake failure
    forcePathStyle: true,
    // SDK ≥3.729 checksum default incompatibile con R2
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  globalR2.__prontopraticaR2 = client;
  return client;
}

function normalizeKey(pathnameOrUrl: string): string {
  const raw = pathnameOrUrl.trim();
  if (raw.startsWith("practices/")) return raw;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    }
  } catch {
    // fall through
  }
  return raw.replace(/^\/+/, "");
}

export function practiceStoragePrefix(applicationId: string): string {
  return `practices/${applicationId}`;
}

/** Presigned PUT: il browser carica diretto su R2 (niente body su Vercel). */
export async function createPresignedPutUrl(params: {
  applicationId: string;
  fileName: string;
  contentType: string;
  /** secondi (default 15 min) */
  expiresIn?: number;
}): Promise<{ uploadUrl: string; storageKey: string }> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  const safeName = params.fileName.replace(/[\\/]+/g, "_").slice(0, 120);
  const storageKey = `${practiceStoragePrefix(params.applicationId)}/_incoming/${randomUUID()}_${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: params.contentType || "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: params.expiresIn ?? 900,
  });

  return { uploadUrl, storageKey };
}

export async function createPresignedGetUrl(
  pathnameOrUrl: string,
  expiresIn = 600,
  options?: { fileName?: string; contentType?: string },
): Promise<string> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  const key = normalizeKey(pathnameOrUrl);
  const safeName = options?.fileName?.replace(/["\r\n]+/g, "").slice(0, 180);
  const effectiveExpiresIn = Math.min(Math.max(expiresIn, 300), 600);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(safeName
        ? {
            ResponseContentDisposition: `inline; filename="${safeName}"`,
          }
        : {}),
      ...(options?.contentType
        ? { ResponseContentType: options.contentType }
        : {}),
    }),
    { expiresIn: effectiveExpiresIn },
  );
}

function wrapR2Error(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("EPROTO") ||
    msg.includes("handshake failure") ||
    msg.includes("SSL") ||
    msg.includes("alert number 40")
  ) {
    throw new Error(
      "R2: certificato SSL dell'account non ancora pronto (normale su account/bucket nuovi). Riprova tra 1 3 ore, oppure verifica su Cloudflare che l'endpoint S3 risponda.",
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

async function putObject(
  pathname: string,
  buffer: Buffer,
  contentType: string,
): Promise<StoredBlob> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: pathname,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      }),
    );
  } catch (err) {
    wrapR2Error(err);
  }
  // URL interno non pubblico: i download passano da /api/files
  return { pathname, url: `r2://${bucket}/${pathname}` };
}

export async function uploadPracticeFile(params: {
  applicationId: string;
  subfolder: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredBlob> {
  const safeName = params.fileName.replace(/[\\/]+/g, "_");
  const pathname = `${practiceStoragePrefix(params.applicationId)}/${params.subfolder}/${safeName}`;
  return putObject(
    pathname,
    params.buffer,
    params.mimeType || "application/octet-stream",
  );
}

export async function uploadAgencyResourceFile(params: {
  resourceId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredBlob> {
  const safeName = params.fileName.replace(/[\\/]+/g, "_");
  const pathname = `resources/${params.resourceId}/${safeName}`;
  return putObject(
    pathname,
    params.buffer,
    params.mimeType || "application/octet-stream",
  );
}

export async function uploadPreventivoFile(params: {
  applicationId: string;
  clientName: string;
  buffer: Buffer;
}): Promise<StoredBlob> {
  const base =
    params.clientName.trim().replace(/[\\/]+/g, " ").replace(/\s+/g, " ") ||
    "Cliente";
  const fileName = `${base}_preventivo.pdf`;
  const pathname = `${practiceStoragePrefix(params.applicationId)}/${fileName}`;
  return putObject(pathname, params.buffer, "application/pdf");
}

export async function uploadRelazioneFile(params: {
  applicationId: string;
  clientName: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredBlob> {
  const base =
    params.clientName.trim().replace(/[\\/]+/g, " ").replace(/\s+/g, " ") ||
    "Cliente";
  const ext = params.fileName.includes(".")
    ? params.fileName.slice(params.fileName.lastIndexOf("."))
    : ".pdf";
  const fileName = `${base}_relazione${ext}`;
  const pathname = `${practiceStoragePrefix(params.applicationId)}/${fileName}`;
  return putObject(
    pathname,
    params.buffer,
    params.mimeType || "application/pdf",
  );
}

export async function downloadBlob(
  pathnameOrUrl: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  const key = normalizeKey(pathnameOrUrl);

  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!result.Body) {
    throw new Error(`File non trovato nello storage: ${key}`);
  }

  const bytes = await result.Body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: result.ContentType || "application/octet-stream",
  };
}

export async function deleteBlobByPathname(pathnameOrUrl: string): Promise<void> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  const key = normalizeKey(pathnameOrUrl);
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function deletePracticeBlobs(applicationId: string): Promise<void> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  const prefix = `${practiceStoragePrefix(applicationId)}/`;
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (page.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k));

    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }

    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

/** Blob di sistema (cron gate, token hub) — non legati a una pratica. */
export async function putSystemBlob(
  pathname: string,
  body: string | Buffer,
  contentType = "application/json",
): Promise<void> {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  await putObject(pathname.replace(/^\/+/, ""), buf, contentType);
}

export async function getSystemBlob(
  pathname: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  const key = pathname.replace(/^\/+/, "");
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!result.Body) return null;
    const bytes = await result.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: result.ContentType || "application/octet-stream",
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (
      name === "NoSuchKey" ||
      name === "NotFound" ||
      msg.includes("NoSuchKey") ||
      msg.includes("Not Found") ||
      msg.includes("404")
    ) {
      return null;
    }
    throw err;
  }
}

export async function deleteSystemBlob(pathname: string): Promise<void> {
  await deleteBlobByPathname(pathname.replace(/^\/+/, ""));
}
