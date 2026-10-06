import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, users } from "@/db/schema";
import type { DocumentType } from "@/db/schema";
import {
  defaultStorageFolders,
  isEuroansaFolder,
  normalizeStorageFolderName,
  storageSubfolderLabel,
} from "@/lib/config/documents";
import {
  BROKER_DRIVE_ROOTS,
  BROKER_ECONOMY_SHEETS,
} from "@/lib/resources/drive-catalog";
import { classifyFilenamesWithAi } from "@/lib/ai/classify-filenames";
import { isClientChecklistFolder } from "@/lib/resources/client-doc-folders";
import { guessDocumentTypeFromFileName } from "@/lib/resources/guess-doc-type";
import {
  downloadFileFromDrive,
  listDriveChildFolders,
  listDriveFolderFileIds,
} from "@/lib/google/drive";
import type { GoogleOAuthClient } from "@/lib/google/auth";
import {
  uploadPracticeFile,
  uploadPreventivoFile,
  uploadRelazioneFile,
} from "@/lib/storage/blob";

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

/** Etichette / totali Excel che non sono clienti. */
const JUNK_NAME_RE =
  /^(EROGATO|POLIZZE|TOTALE|SUBTOTAL|MEDIA|ACCORDI|ACCORDO|%?\s*CLIENTE|CLIENTE\s*\(|CQS\s*$|PRESTITI?\s*$|FATTURATO|QUOTA|MUTUO\s*$|BANCA\s*$)/i;

export function isJunkClientName(name: string): boolean {
  const t = name.trim();
  if (!t || t.length < 2) return true;
  if (/^ACQUIRENTE$/i.test(t)) return true;
  if (JUNK_NAME_RE.test(t)) return true;
  if (/^\d+%?$/.test(t)) return true;
  if (/%\s*CLIENTE/i.test(t)) return true;
  if (/\(\s*\d{4,}\s*-\s*\d+%?\s*\)/.test(t) && /CLIENTE|POLIZZ|EROGAT/i.test(t))
    return true;
  return false;
}

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

function looksLikeRealClient(row: {
  name: string;
  phone: string | null;
  bankName: string | null;
  provenance: string | null;
  loanAmount: number | null;
  propertyAmount: number | null;
}): boolean {
  if (isJunkClientName(row.name)) return false;
  if (row.phone && /\d{6,}/.test(row.phone.replace(/\D/g, ""))) return true;
  if (row.bankName && row.bankName.length >= 3) return true;
  if (row.provenance && row.provenance.length >= 3) return true;
  // Nome persona-ish + mutuo/immobile
  if (
    /[A-Za-zÀ-ù]{3,}/.test(row.name) &&
    (row.loanAmount || row.propertyAmount) &&
    !/%/.test(row.name)
  ) {
    return true;
  }
  return false;
}

async function parseClosedSheet(
  buffer: Buffer,
  year: number,
  now = new Date(),
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
  const nowMonth = now.getUTCFullYear() === year ? now.getUTCMonth() : 11;

  for (const row of rows) {
    const c0 = String(row[0] ?? "")
      .trim()
      .toUpperCase();
    if (MONTHS[c0] != null) {
      month = MONTHS[c0]!;
      continue;
    }
    // Mesi futuri (stesso anno): non importare
    if (year > now.getUTCFullYear()) continue;
    if (year === now.getUTCFullYear() && month > nowMonth) continue;

    const name = String(row[1] ?? "").trim();
    if (!name || isJunkClientName(name)) continue;

    const loanAmount = parseMoney(row[3]);
    const propertyAmount = parseMoney(row[4]);
    const commissionClient = parseMoney(row[13]);
    if (!loanAmount && !propertyAmount && !commissionClient) continue;

    const phone = String(row[2] ?? "").trim() || null;
    const provenance = String(row[6] ?? "").trim() || null;
    const bankName = String(row[7] ?? "").trim() || null;

    if (
      !looksLikeRealClient({
        name,
        phone,
        bankName,
        provenance,
        loanAmount,
        propertyAmount,
      })
    ) {
      continue;
    }

    out.push({
      clientName: name.toUpperCase(),
      phone,
      loanAmount,
      propertyAmount,
      ltvPercent: parsePercent(row[5]),
      provenance,
      bankName,
      commissionPolicy: parseMoney(row[10]),
      commissionCqs: parseMoney(row[11]),
      commissionBank: parseMoney(row[12]),
      commissionClient,
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

async function removeJunkRogitate(brokerId: string): Promise<number> {
  const rows = await db
    .select({
      id: applications.id,
      clientName: applications.clientName,
      clientEmail: applications.clientEmail,
    })
    .from(applications)
    .where(
      and(
        eq(applications.brokerId, brokerId),
        eq(applications.status, "ROGITATA"),
      ),
    );

  let removed = 0;
  for (const r of rows) {
    if (!isJunkClientName(r.clientName)) continue;
    // Solo import automatici (@prontopratica.local) per non toccare pratiche manuali
    if (!/@prontopratica\.local$/i.test(r.clientEmail)) continue;
    await db.delete(applications).where(eq(applications.id, r.id));
    removed += 1;
  }
  return removed;
}

function classifySubfolder(
  folderName: string,
  clientName: string,
): "DOC" | "BANCA" | "IMMOBILE" | "EUROANSA" | null {
  const n = normalizeStorageFolderName(folderName).toUpperCase();
  if (isEuroansaFolder(n) || n === "EUROANSA") return "EUROANSA";
  if (/^BANCA$/i.test(n)) return "BANCA";
  if (/^IMMOBILE$/i.test(n)) return "IMMOBILE";
  if (/\bDOC\b/i.test(n)) return "DOC";
  // Match "ALI DOC" style
  const docLabel = storageSubfolderLabel("DOC", clientName).toUpperCase();
  if (n === docLabel || n.endsWith(" DOC")) return "DOC";
  return null;
}

export async function importClosedPracticesFromDrive(params: {
  auth: GoogleOAuthClient;
  year?: number;
}): Promise<{
  created: number;
  updated: number;
  skipped: number;
  junkRemoved: number;
  docsAttached: number;
  typesUpdated: number;
  errors: string[];
}> {
  const year = params.year ?? 2026;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let junkRemoved = 0;
  let docsAttached = 0;
  let typesUpdated = 0;
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

    try {
      junkRemoved += await removeJunkRogitate(brokerId);
    } catch (err) {
      errors.push(
        `cleanup ${job.label}: ${err instanceof Error ? err.message : "errore"}`,
      );
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

    try {
      const n = await syncPracticeFoldersFromBrokerRoot({
        auth: params.auth,
        brokerId,
        folderId: BROKER_DRIVE_ROOTS[job.label],
      });
      docsAttached += n;
    } catch (err) {
      errors.push(
        `cartelle ${job.label}: ${err instanceof Error ? err.message : "errore"}`,
      );
    }
  }

  // Rivaluta tipi da nome file (es. ESLAM_bp 03 → busta paga) e aggiorna checklist
  try {
    const re = await reclassifyImportedDocuments();
    typesUpdated = re.typesUpdated;
  } catch (err) {
    errors.push(
      `riclassifica: ${err instanceof Error ? err.message : "errore"}`,
    );
  }

  return {
    created,
    updated,
    skipped,
    junkRemoved,
    docsAttached,
    typesUpdated,
    errors,
  };
}

/** Rivaluta tipi (euristica + AI nomi) e checklist solo su DOC/IMMOBILE cliente. */
export async function reclassifyImportedDocuments(): Promise<{
  typesUpdated: number;
  checklistsUpdated: number;
  aiClassified: number;
  stillUnknownClient: number;
}> {
  const rows = await db
    .select({
      id: documents.id,
      applicationId: documents.applicationId,
      rawFileName: documents.rawFileName,
      renamedFileName: documents.renamedFileName,
      documentType: documents.documentType,
      isValid: documents.isValid,
      storageSubfolder: documents.storageSubfolder,
    })
    .from(documents);

  const apps = await db
    .select({ id: applications.id, clientName: applications.clientName })
    .from(applications);
  const nameByApp = new Map(apps.map((a) => [a.id, a.clientName]));

  let typesUpdated = 0;

  for (const row of rows) {
    if (row.documentType !== "SCONOSCIUTO") continue;
    const guess = guessDocumentTypeFromFileName(
      row.rawFileName || row.renamedFileName,
    );
    if (guess === "SCONOSCIUTO") continue;
    await db
      .update(documents)
      .set({ documentType: guess, isValid: true })
      .where(eq(documents.id, row.id));
    row.documentType = guess;
    typesUpdated += 1;
  }

  // AI sui residuali solo in cartelle checklist (DOC/IMMOBILE)
  const needAi = rows.filter((row) => {
    if (row.documentType !== "SCONOSCIUTO") return false;
    const clientName = nameByApp.get(row.applicationId) ?? "CLIENTE";
    return isClientChecklistFolder(row.storageSubfolder, clientName);
  });

  let aiClassified = 0;
  if (needAi.length) {
    const aiMap = await classifyFilenamesWithAi(
      needAi.map((r) => ({
        id: r.id,
        fileName: r.rawFileName || r.renamedFileName,
      })),
    );
    for (const row of needAi) {
      const t = aiMap.get(row.id);
      if (!t || t === "SCONOSCIUTO") continue;
      await db
        .update(documents)
        .set({ documentType: t, isValid: true })
        .where(eq(documents.id, row.id));
      row.documentType = t;
      aiClassified += 1;
      typesUpdated += 1;
    }
  }

  let checklistsUpdated = 0;
  let stillUnknownClient = 0;
  const appIds = [...new Set(rows.map((r) => r.applicationId))];

  for (const appId of appIds) {
    const clientName = nameByApp.get(appId) ?? "CLIENTE";
    const docs = await db
      .select({
        documentType: documents.documentType,
        isValid: documents.isValid,
        storageSubfolder: documents.storageSubfolder,
      })
      .from(documents)
      .where(eq(documents.applicationId, appId));

    const clientDocs = docs.filter((d) =>
      isClientChecklistFolder(d.storageSubfolder, clientName),
    );
    stillUnknownClient += clientDocs.filter(
      (d) => d.documentType === "SCONOSCIUTO",
    ).length;

    const types = [
      ...new Set(
        clientDocs
          .filter((d) => d.isValid && d.documentType !== "SCONOSCIUTO")
          .map((d) => d.documentType),
      ),
    ];
    if (types.length === 0) continue;
    await db
      .update(applications)
      .set({
        requiredDocumentTypes: types,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, appId));
    checklistsUpdated += 1;
  }

  return {
    typesUpdated,
    checklistsUpdated,
    aiClassified,
    stillUnknownClient,
  };
}

async function syncPracticeFoldersFromBrokerRoot(params: {
  auth: GoogleOAuthClient;
  brokerId: string;
  folderId: string;
}): Promise<number> {
  const practiceFolders = await listDriveChildFolders(
    params.folderId,
    params.auth,
  );
  let attached = 0;

  for (const folder of practiceFolders) {
    const needle = folder.name
      .replace(/-PRATICA.*/i, "")
      .replace(/\s*PP$/i, "")
      .trim()
      .toUpperCase();
    if (!needle || needle.length < 3 || isJunkClientName(needle)) continue;

    const firstToken = needle.split(/\s+/)[0] ?? needle;
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.brokerId, params.brokerId),
          or(
            eq(applications.clientName, needle),
            ilike(applications.clientName, `%${firstToken}%`),
          ),
        ),
      )
      .limit(1);
    if (!app) continue;

    const existingDocs = await db
      .select({
        rawFileName: documents.rawFileName,
        renamedFileName: documents.renamedFileName,
        storageSubfolder: documents.storageSubfolder,
      })
      .from(documents)
      .where(eq(documents.applicationId, app.id));
    const seenNames = new Set(
      existingDocs.flatMap((d) => [
        d.rawFileName.toLowerCase(),
        d.renamedFileName.toLowerCase(),
      ]),
    );

    const importedTypes = new Set<DocumentType>();
    const existingTypes = await db
      .select({
        documentType: documents.documentType,
        isValid: documents.isValid,
      })
      .from(documents)
      .where(eq(documents.applicationId, app.id));
    for (const d of existingTypes) {
      if (d.isValid && d.documentType !== "SCONOSCIUTO") {
        importedTypes.add(d.documentType);
      }
    }

    const childFolders = await listDriveChildFolders(folder.id, params.auth);

    // File in root pratica (relazione / preventivo)
    const rootFileIds = await listDriveFolderFileIds(folder.id, params.auth);
    for (const fid of rootFileIds) {
      try {
        const file = await downloadFileFromDrive(fid, params.auth);
        const lower = file.fileName.toLowerCase();
        if (/relazione/i.test(lower) && !app.relazioneStorageKey) {
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
          app.relazioneStorageKey = uploaded.pathname;
          attached += 1;
          continue;
        }
        if (/preventivo/i.test(lower) && !app.preventivoStorageKey) {
          const uploaded = await uploadPreventivoFile({
            applicationId: app.id,
            clientName: app.clientName,
            buffer: file.buffer,
          });
          await db
            .update(applications)
            .set({
              preventivoStorageKey: uploaded.pathname,
              preventivoFileName:
                uploaded.pathname.split("/").pop() ?? "preventivo.pdf",
              updatedAt: new Date(),
            })
            .where(eq(applications.id, app.id));
          app.preventivoStorageKey = uploaded.pathname;
          attached += 1;
        }
      } catch {
        // skip
      }
    }

    for (const sub of childFolders) {
      const kind = classifySubfolder(sub.name, app.clientName);
      if (!kind) continue;
      const subfolderLabel = storageSubfolderLabel(kind, app.clientName);
      const fileIds = await listDriveFolderFileIds(sub.id, params.auth);

      for (const fid of fileIds) {
        try {
          const file = await downloadFileFromDrive(fid, params.auth);
          const key = file.fileName.toLowerCase();
          if (seenNames.has(key)) continue;
          if (/relazione/i.test(key) && !app.relazioneStorageKey) {
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
            app.relazioneStorageKey = uploaded.pathname;
            attached += 1;
            seenNames.add(key);
            continue;
          }
          if (/preventivo/i.test(key) && !app.preventivoStorageKey) {
            const uploaded = await uploadPreventivoFile({
              applicationId: app.id,
              clientName: app.clientName,
              buffer: file.buffer,
            });
            await db
              .update(applications)
              .set({
                preventivoStorageKey: uploaded.pathname,
                preventivoFileName:
                  uploaded.pathname.split("/").pop() ?? "preventivo.pdf",
                updatedAt: new Date(),
              })
              .where(eq(applications.id, app.id));
            app.preventivoStorageKey = uploaded.pathname;
            attached += 1;
            seenNames.add(key);
            continue;
          }

          const docType = guessDocumentTypeFromFileName(file.fileName);
          const uploaded = await uploadPracticeFile({
            applicationId: app.id,
            subfolder: subfolderLabel,
            fileName: file.fileName,
            mimeType: file.mimeType,
            buffer: file.buffer,
          });
          const [inserted] = await db
            .insert(documents)
            .values({
              applicationId: app.id,
              rawFileName: file.fileName,
              renamedFileName: file.fileName,
              documentType: docType,
              driveFileId: uploaded.pathname,
              driveFileUrl: null,
              storageSubfolder: subfolderLabel,
              isValid: true,
              validationIssues: [],
              keptForHistory: true,
            })
            .returning({ id: documents.id });
          if (inserted) {
            await db
              .update(documents)
              .set({ driveFileUrl: `/api/files/${inserted.id}` })
              .where(eq(documents.id, inserted.id));
          }
          seenNames.add(key);
          if (
            docType !== "SCONOSCIUTO" &&
            isClientChecklistFolder(subfolderLabel, app.clientName)
          ) {
            importedTypes.add(docType);
          }
          attached += 1;
        } catch {
          // skip file
        }
      }
    }

    // Checklist solo DOC/IMMOBILE (i tipi finali li rifinisce reclassifyImportedDocuments)
    if (importedTypes.size > 0) {
      await db
        .update(applications)
        .set({
          requiredDocumentTypes: [...importedTypes],
          storageFolders: defaultStorageFolders(app.clientName),
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));
    }
  }

  return attached;
}
