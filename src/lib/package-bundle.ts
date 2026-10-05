import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { downloadBlob } from "@/lib/storage/blob";
import { isSiteStorageKey } from "@/lib/storage/paths";
import {
  getGoogleAuthForUser,
  listConnectedGoogleUsers,
  oauthClientFromRefreshToken,
} from "@/lib/google/auth";
import { downloadFileFromDrive } from "@/lib/google/drive";

export async function loadPackageFileBuffer(
  storageKey: string,
  brokerId: string | null,
): Promise<Buffer> {
  if (isSiteStorageKey(storageKey)) {
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
  onSiteStorage: boolean;
};

export type PackageBundleResult =
  | {
      status: "ok";
      app: typeof applications.$inferSelect;
      files: PackageFile[];
      legacyCount: number;
    }
  | { status: "expired"; app: typeof applications.$inferSelect }
  | { status: "invalid" };

export async function getPackageBundle(
  applicationId: string,
  token: string,
): Promise<PackageBundleResult> {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app || !app.packageToken || app.packageToken !== token) {
    return { status: "invalid" };
  }

  if (
    app.packageTokenExpiresAt &&
    app.packageTokenExpiresAt.getTime() < Date.now()
  ) {
    return { status: "expired", app };
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  const usedNames = new Set<string>();
  const files: PackageFile[] = [];
  let legacyCount = 0;

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
    const onSite = isSiteStorageKey(doc.driveFileId);
    if (!onSite) {
      legacyCount += 1;
      continue;
    }
    files.push({
      name: uniqueName(doc.renamedFileName),
      storageKey: doc.driveFileId,
      onSiteStorage: true,
    });
  }

  if (app.relazioneStorageKey && isSiteStorageKey(app.relazioneStorageKey)) {
    files.push({
      name: uniqueName(app.relazioneFileName ?? `${app.clientName}_relazione.pdf`),
      storageKey: app.relazioneStorageKey,
      onSiteStorage: true,
    });
  }

  if (app.preventivoStorageKey && isSiteStorageKey(app.preventivoStorageKey)) {
    files.push({
      name: uniqueName(
        app.preventivoFileName ?? `${app.clientName}_preventivo.pdf`,
      ),
      storageKey: app.preventivoStorageKey,
      onSiteStorage: true,
    });
  }

  return {
    status: "ok",
    app,
    files,
    legacyCount,
  };
}
