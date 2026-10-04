/**
 * Upload diretto browser → R2 (presigned), poi analisi Gemini sul server.
 */

export type DirectUploadResult = {
  count: number;
  errors: string[];
};

const UPLOAD_CONCURRENCY = 4;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]!);
    }
  }
  const n = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function presignOne(params: {
  applicationId: string;
  file: File;
}): Promise<{ uploadUrl: string; storageKey: string }> {
  const res = await fetch("/api/documents/presigned-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId: params.applicationId,
      fileName: params.file.name,
      contentType: params.file.type || "application/octet-stream",
    }),
  });
  const data = (await res.json()) as {
    uploadUrl?: string;
    storageKey?: string;
    error?: string;
  };
  if (!res.ok || !data.uploadUrl || !data.storageKey) {
    throw new Error(data.error || "Presign fallito");
  }
  return { uploadUrl: data.uploadUrl, storageKey: data.storageKey };
}

export async function uploadFilesDirectToR2(params: {
  applicationId: string;
  files: File[];
  subfolder?: string;
  /** Se true salta Gemini (cartelle non DOC/BANCA/IMMOBILE) — gestito lato server via subfolder */
  skipAi?: boolean;
}): Promise<DirectUploadResult> {
  const files = params.files.filter((f) => f && f.size > 0);
  if (files.length === 0) {
    return { count: 0, errors: ["Nessun file selezionato"] };
  }

  const uploaded: Array<{
    storageKey: string;
    fileName: string;
    contentType: string;
  }> = [];
  const errors: string[] = [];

  const outcomes = await mapPool(files, UPLOAD_CONCURRENCY, async (file) => {
    try {
      const { uploadUrl, storageKey } = await presignOne({
        applicationId: params.applicationId,
        file,
      });
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });
      if (!put.ok) {
        throw new Error(`Upload R2 HTTP ${put.status}`);
      }
      return {
        ok: true as const,
        item: {
          storageKey,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        },
      };
    } catch (err) {
      return {
        ok: false as const,
        error: `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  for (const outcome of outcomes) {
    if (outcome.ok) uploaded.push(outcome.item);
    else errors.push(outcome.error);
  }

  if (uploaded.length === 0) {
    return { count: 0, errors };
  }

  const res = await fetch("/api/documents/process-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId: params.applicationId,
      files: uploaded,
      subfolder: params.subfolder,
      skipAi: params.skipAi === true,
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    count?: number;
    errors?: string[];
    error?: string;
  };
  if (!res.ok) {
    return {
      count: 0,
      errors: [...errors, data.error || "Elaborazione fallita"],
    };
  }

  return {
    count: data.count ?? uploaded.length,
    errors: [...errors, ...(data.errors ?? [])],
  };
}
