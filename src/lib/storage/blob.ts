/**
 * Storage documenti su Cloudflare R2 (S3-compatible).
 * I pathname restano `practices/{id}/...` come prima (compat DB).
 */
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type StoredBlob = {
  pathname: string;
  url: string;
};

function requireR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : undefined);

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 non configurato: imposta R2_ACCOUNT_ID (o R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME",
    );
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function getR2Client() {
  const { endpoint, accessKeyId, secretAccessKey } = requireR2Config();
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
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

async function putObject(
  pathname: string,
  buffer: Buffer,
  contentType: string,
): Promise<StoredBlob> {
  const { bucket } = requireR2Config();
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: pathname,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    }),
  );
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
