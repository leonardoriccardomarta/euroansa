import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";

export async function setApplicationPipelineError(
  applicationId: string,
  message: string | null,
) {
  // Upload errors or duplicate file warnings must strictly be transient client notifications.
  // They MUST NEVER be written as a permanent application-level error flag in the database.
  // Only nullifying/clearing is persisted to DB to clean up any legacy stuck errors.
  try {
    await db
      .update(applications)
      .set({
        lastPipelineError: null,
        lastPipelineErrorAt: null,
      })
      .where(eq(applications.id, applicationId));
  } catch (err) {
    console.error("setApplicationPipelineError clear error", err);
  }
}
