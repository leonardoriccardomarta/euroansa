/**
 * Upload diretto browser → R2 (presigned), poi analisi Gemini sul server.
 */

export type DirectUploadResult = {
  count: number;
  errors: string[];
};

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

  for (const file of files) {
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
      uploaded.push({
        storageKey,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      });
    } catch (err) {
      errors.push(
        `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
