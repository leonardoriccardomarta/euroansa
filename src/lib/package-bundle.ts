import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { downloadBlob } from "@/lib/storage/blob";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { downloadFileFromDrive } from "@/lib/google/drive";

function looksLikeBlobPath(key: string): boolean {
  return (
    key.startsWith("practices/") ||
    key.includes("/") ||
    key.startsWith("http://") ||
    key.startsWith("https://")
  );
}

export async function loadPackageFileBuffer(
  storageKey: string,
  brokerId: string | null,
): Promise<Buffer> {
  if (looksLikeBlobPath(storageKey)) {
    const { buffer } = await downloadBlob(storageKey);
    return buffer;
  }

  let auth;
  if (brokerId) {
    try {
      auth = await getGoogleAuthForUser(brokerId);
    } catch {
      // fall through
    }
  }
  if (!auth) {
    const connected = await listConnectedGoogleUsers();
    if (!connected[0]) {
      throw new Error("File non disponibile nello storage");
    }
    auth = oauthClientFromRefreshToken(connected[0].googleRefreshToken);
  }
  const downloaded = await downloadFileFromDrive(storageKey, auth);
  return downloaded.buffer;
}

export type PackageFile = {
  name: string;
  storageKey: string;
};

export async function getPackageBundle(applicationId: string, token: string) {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app || !app.packageToken || app.packageToken !== token) {
    return null;
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  const usedNames = new Set<string>();
  const files: PackageFile[] = [];

  function uniqueName(raw: string): string {
    const base = raw.replace(/[\\/]+/g, "_").trim() || "file.pdf";
    if (!usedNames.has(base.toLowerCase())) {
      usedNames.add(base.toLowerCase());
      return base;
    }
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    let i = 2;
    let candidate = `${stem}_${i}${ext}`;
    while (usedNames.has(candidate.toLowerCase())) {
      i += 1;
      candidate = `${stem}_${i}${ext}`;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  for (const doc of docs) {
    if (!doc.isValid || !doc.driveFileId) continue;
    files.push({
      name: uniqueName(doc.renamedFileName),
      storageKey: doc.driveFileId,
    });
  }

  if (app.relazioneStorageKey) {
    files.push({
      name: uniqueName(app.relazioneFileName ?? `${app.clientName}_relazione.pdf`),
      storageKey: app.relazioneStorageKey,
    });
  }

  return {
    app,
    files,
  };
}
