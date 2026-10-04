import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";

export async function setApplicationPipelineError(
  applicationId: string,
  message: string | null,
) {
  await db
    .update(applications)
    .set({
      lastPipelineError: message,
      lastPipelineErrorAt: message ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));
}
