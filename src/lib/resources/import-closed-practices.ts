import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { applications, users } from "@/db/schema";
import { defaultStorageFolders } from "@/lib/config/documents";
import {
  BROKER_DRIVE_ROOTS,
  BROKER_ECONOMY_SHEETS,
} from "@/lib/resources/drive-catalog";
import {
  downloadFileFromDrive,
  listDriveFolderFileIds,
} from "@/lib/google/drive";
import type { GoogleOAuthClient } from "@/lib/google/auth";
import { uploadRelazioneFile } from "@/lib/storage/blob";

const MONTHS: Record<string, number> = {
  GENNAIO: 0,
  FEBBRAIO: 1,
  MARZO: 2,
  APRILE: 3,
  MAGGIO: 4,
  GIUGNO: 5,
  LUGLIO: 6,
  AGOSTO: 7,
  SETTEMBRE: 8,
  OTTOBRE: 9,
  NOVEMBRE: 10,
  DICEMBRE: 11,
};

function parseMoney(raw: unknown): number | null {
  const s = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parsePercent(raw: unknown): number | null {
  const s = String(raw ?? "").replace("%", "").replace(",", ".").trim();
  if (!s || /div/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type ClosedPracticeRow = {
  clientName: string;
  phone: string | null;
  loanAmount: number | null;
  propertyAmount: number | null;
  ltvPercent: number | null;
  provenance: string | null;
  bankName: string | null;
  commissionPolicy: number | null;
  commissionCqs: number | null;
  commissionBank: number | null;
  commissionClient: number | null;
  commissionLoans: number | null;
  commissionNotary: number | null;
  rogitoAt: Date;
};

async function parseClosedSheet(
  buffer: Buffer,
  year: number,
): Promise<ClosedPracticeRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet =
    wb.Sheets["PRATICHE CONCLUSE"] ??
    wb.Sheets[wb.SheetNames.find((n) => /conclu/i.test(n)) ?? ""];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  let month = 0;
  const out: ClosedPracticeRow[] = [];

  for (const row of rows) {
    const c0 = String(row[0] ?? "")
      .trim()
      .toUpperCase();
    if (MONTHS[c0] != null) {
      month = MONTHS[c0]!;
      continue;
    }
    const name = String(row[1] ?? "").trim();
    if (!name || /^ACQUIRENTE$/i.test(name)) continue;
    if (/cqs|prestito|accordi/i.test(name) && !parseMoney(row[3])) {
      // CQS-only rows: still import if they have client commission-ish data
    }
    const loanAmount = parseMoney(row[3]);
    const propertyAmount = parseMoney(row[4]);
    if (!loanAmount && !propertyAmount && !parseMoney(row[13])) continue;

    out.push({
      clientName: name.toUpperCase(),
      phone: String(row[2] ?? "").trim() || null,
      loanAmount,
      propertyAmount,
      ltvPercent: parsePercent(row[5]),
      provenance: String(row[6] ?? "").trim() || null,
      bankName: String(row[7] ?? "").trim() || null,
      commissionPolicy: parseMoney(row[10]),
      commissionCqs: parseMoney(row[11]),
      commissionBank: parseMoney(row[12]),
      commissionClient: parseMoney(row[13]),
      commissionLoans: parseMoney(row[14]),
      commissionNotary: parseMoney(row[15]),
      rogitoAt: new Date(Date.UTC(year, month, 15, 12, 0, 0)),
    });
  }
  return out;
}

async function findBrokerId(
  label: "FILIPPO" | "MARCO",
): Promise<string | null> {
  const needles =
    label === "FILIPPO"
      ? ["filippo", "filip", "filipp"]
      : ["marco", "gorla"];
  const all = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "BROKER"));
  for (const n of needles) {
    const hit = all.find(
      (u) =>
        u.name.toLowerCase().includes(n) ||
        u.email.toLowerCase().includes(n),
    );
    if (hit) return hit.id;
  }
  return all[0]?.id ?? null;
}

export async function importClosedPracticesFromDrive(params: {
  auth: GoogleOAuthClient;
  year?: number;
}): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const year = params.year ?? 2026;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  const jobs: { label: "FILIPPO" | "MARCO"; sheetId: string }[] = [
    { label: "FILIPPO", sheetId: BROKER_ECONOMY_SHEETS.FILIPPO_2026 },
    { label: "MARCO", sheetId: BROKER_ECONOMY_SHEETS.MARCO_2026 },
  ];

  for (const job of jobs) {
    const brokerId = await findBrokerId(job.label);
    if (!brokerId) {
      errors.push(`Broker ${job.label} non trovato tra gli utenti`);
      continue;
    }

    let rows: ClosedPracticeRow[] = [];
    try {
      const file = await downloadFileFromDrive(job.sheetId, params.auth);
      rows = await parseClosedSheet(file.buffer, year);
    } catch (err) {
      errors.push(
        `${job.label} excel: ${err instanceof Error ? err.message : "errore"}`,
      );
      continue;
    }

    for (const row of rows) {
      try {
        const [existing] = await db
          .select()
          .from(applications)
          .where(
            and(
              eq(applications.clientName, row.clientName),
              eq(applications.brokerId, brokerId),
              eq(applications.status, "ROGITATA"),
            ),
          )
          .limit(1);

        const payload = {
          clientName: row.clientName,
          clientEmail: `${row.clientName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ".")
            .replace(/^\.+|\.+$/g, "")}@prontopratica.local`,
          phone: row.phone,
          brokerId,
          status: "ROGITATA" as const,
          bankName: row.bankName,
          provenance: row.provenance,
          loanAmount: row.loanAmount,
          propertyAmount: row.propertyAmount,
          ltvPercent: row.ltvPercent,
          commissionClient: row.commissionClient,
          commissionBank: row.commissionBank,
          commissionPolicy: row.commissionPolicy,
          commissionCqs: row.commissionCqs,
          commissionLoans: row.commissionLoans,
          commissionNotary: row.commissionNotary,
          rogitoAt: row.rogitoAt,
          storageFolders: defaultStorageFolders(row.clientName),
          updatedAt: new Date(),
        };

        if (existing) {
          await db
            .update(applications)
            .set(payload)
            .where(eq(applications.id, existing.id));
          updated += 1;
        } else {
          await db.insert(applications).values({
            ...payload,
            isTest: false,
          });
          created += 1;
        }
      } catch (err) {
        skipped += 1;
        errors.push(
          `${row.clientName}: ${err instanceof Error ? err.message : "errore"}`,
        );
      }
    }

    // Best-effort: allega relazione se c'è file *_relazione* nella cartella pratica Drive
    try {
      await attachRelazioniFromBrokerFolder({
        auth: params.auth,
        brokerId,
        folderId: BROKER_DRIVE_ROOTS[job.label],
      });
    } catch (err) {
      errors.push(
        `relazioni ${job.label}: ${err instanceof Error ? err.message : "errore"}`,
      );
    }
  }

  return { created, updated, skipped, errors };
}

async function attachRelazioniFromBrokerFolder(params: {
  auth: GoogleOAuthClient;
  brokerId: string;
  folderId: string;
}) {
  const { getDriveClient } = await import("@/lib/google/auth");
  // getDriveClient usa l'auth hub se omesso; qui forziamo il client collegato
  const drive = getDriveClient(params.auth);
  let pageToken: string | undefined;
  const practiceFolders: { id: string; name: string }[] = [];
  do {
    const page = await drive.files.list({
      q: `'${params.folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken, files(id,name)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of page.data.files ?? []) {
      if (f.id && f.name) practiceFolders.push({ id: f.id, name: f.name });
    }
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);

  for (const folder of practiceFolders) {
    const needle = folder.name
      .replace(/-PRATICA.*/i, "")
      .replace(/PP$/i, "")
      .trim()
      .toUpperCase();
    if (!needle || needle.length < 3) continue;

    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.brokerId, params.brokerId),
          or(
            eq(applications.clientName, needle),
            ilike(applications.clientName, `%${needle.split(/\s+/)[0]}%`),
          ),
        ),
      )
      .limit(1);
    if (!app || app.relazioneStorageKey) continue;

    const fileIds = await listDriveFolderFileIds(folder.id, params.auth);
    for (const fid of fileIds) {
      try {
        const file = await downloadFileFromDrive(fid, params.auth);
        if (!/relazione/i.test(file.fileName)) continue;
        const uploaded = await uploadRelazioneFile({
          applicationId: app.id,
          clientName: app.clientName,
          fileName: file.fileName,
          mimeType: file.mimeType,
          buffer: file.buffer,
        });
        await db
          .update(applications)
          .set({
            relazioneStorageKey: uploaded.pathname,
            relazioneFileName:
              uploaded.pathname.split("/").pop() ?? file.fileName,
            relazioneUploadedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(applications.id, app.id));
        break;
      } catch {
        // skip file
      }
    }
  }
}
