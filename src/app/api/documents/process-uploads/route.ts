import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { setApplicationPipelineError } from "@/lib/applications/errors";
import { processDirectUploads } from "@/lib/pipeline";
import { sanitizeFolderName } from "@/lib/config/documents";
import {
  deleteBlobByPathname,
  downloadBlob,
  uploadPracticeFile,
} from "@/lib/storage/blob";

export const maxDuration = 120;

type UploadItem = {
  storageKey: string;
  fileName: string;
  contentType?: string;
};

/**
 * Dopo PUT diretto su R2: Gemini + salvataggio path finale.
 * POST { applicationId, files: [...], subfolder?, skipAi? }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    applicationId?: string;
    files?: UploadItem[];
    subfolder?: string;
    skipAi?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  const applicationId = body.applicationId?.trim();
  const files = body.files ?? [];
  if (!applicationId || files.length === 0) {
    return NextResponse.json(
      { error: "applicationId e files richiesti" },
      { status: 400 },
    );
  }

  const [app] = await db
    .select({
      id: applications.id,
      brokerId: applications.brokerId,
      isTest: applications.isTest,
      clientName: applications.clientName,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) {
    return NextResponse.json({ error: "Pratica non trovata" }, { status: 404 });
  }
  if (app.isTest && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!app.brokerId) {
    await db
      .update(applications)
      .set({ brokerId: session.id, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  const subfolder = body.subfolder
    ? sanitizeFolderName(body.subfolder)
    : undefined;

  try {
    if (body.skipAi && subfolder) {
      const outcomes = await Promise.all(
        files.map(async (f) => {
          try {
            const { buffer } = await downloadBlob(f.storageKey);
            const safeName = f.fileName.replace(/[\\/]+/g, "_");
            const uploaded = await uploadPracticeFile({
              applicationId,
              subfolder,
              fileName: safeName,
              mimeType: f.contentType || "application/octet-stream",
              buffer,
            });
            try {
              await deleteBlobByPathname(f.storageKey);
            } catch {
              // ignore
            }
            const [inserted] = await db
              .insert(documents)
              .values({
                applicationId,
                rawFileName: f.fileName,
                renamedFileName: safeName,
                documentType: "SCONOSCIUTO",
                driveFileId: uploaded.pathname,
                driveFileUrl: null,
                storageSubfolder: subfolder,
                isValid: true,
                extractedData: {},
                validationIssues: [],
              })
              .returning({ id: documents.id });
            if (inserted) {
              await db
                .update(documents)
                .set({ driveFileUrl: `/api/files/${inserted.id}` })
                .where(eq(documents.id, inserted.id));
            }
            return { ok: true as const };
          } catch (err) {
            return {
              ok: false as const,
              error: `${f.fileName}: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        }),
      );
      const count = outcomes.filter((o) => o.ok).length;
      const errors = outcomes
        .filter((o): o is { ok: false; error: string } => !o.ok)
        .map((o) => o.error);
      await setApplicationPipelineError(applicationId, null);
      revalidatePath(`/dashboard/applications/${applicationId}`);
      revalidatePath(`/dashboard/files/${applicationId}`);
      return NextResponse.json({ ok: true, count, errors });
    }

    const result = await processDirectUploads(
      files.map((f) => ({
        storageKey: f.storageKey,
        originalFileName: f.fileName,
        mimeType: f.contentType || "application/octet-stream",
      })),
      {
        applicationId,
        brokerId: app.brokerId ?? session.id,
        subfolder,
      },
    );

    await setApplicationPipelineError(applicationId, null);

    revalidatePath(`/dashboard/applications/${applicationId}`);
    revalidatePath(`/dashboard/files/${applicationId}`);
    revalidatePath("/dashboard");

    return NextResponse.json({
      ok: true,
      count: result.processed,
      errors: result.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Elaborazione fallita";
    await setApplicationPipelineError(applicationId, null);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
