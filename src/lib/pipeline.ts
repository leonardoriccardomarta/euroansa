import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents, systemSettings, users } from "@/db/schema";
import type { DocumentAnalysisStatus, DocumentType } from "@/db/schema";
import { isPlaceholderClientEmail } from "@/lib/client-email";
import { analyzeDocument } from "@/lib/ai/analyze-document";
import {
  checkAnagraphicCoherence,
  coupleCoherenceNotes,
} from "@/lib/ai/coherence";
import {
  deriveApplicationStatus,
  evaluateChecklist,
  inferEmploymentType,
} from "@/lib/checklist";
import {
  CHECKLIST_PRESETS,
  defaultStorageFolders,
  FILE_NAME_PREFIX,
  SHEET_SECTIONS,
  storageFolderKindForDocument,
  storageSubfolderLabel,
} from "@/lib/config/documents";
import {
  coupleNameHintFromSubject,
  coupleSubjectKey,
  isCoupleEmailSubject,
  mergeCoupleClientName,
} from "@/lib/couple-mail";
import { computePreScoring } from "@/lib/prescoring";
import {
  deleteBlobByPathname,
  downloadBlob,
  practiceStoragePrefix,
  uploadPracticeFile,
} from "@/lib/storage/blob";
import { sendApplicationToSecretary } from "@/lib/google/secretary-sender";
import { setApplicationPipelineError } from "@/lib/applications/errors";
import { notifySecretarySendFailed } from "@/lib/notify/broker-mail";
import { getAppBaseUrl } from "@/lib/app-url";

export type IncomingFile = {
  buffer: Buffer;
  mimeType: string;
  originalFileName: string;
  clientEmail?: string;
  clientNameHint?: string;
  /** Key R2 da upload diretto (_incoming/…); rimossa dopo salvataggio finale */
  incomingStorageKey?: string;
};

const OPEN_STATUSES = ["DOCUMENTI_INCOMPLETI", "COMPLETA_DA_INOLTRARE"] as const;
const PAYSLIP_SLOTS: DocumentType[] = [
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
];

function withResolvedType<
  T extends { documentType: DocumentType; standardizedFileName: string },
>(analysis: T, resolved: DocumentType, originalFileName: string): T {
  if (analysis.documentType === resolved) return analysis;
  const ext = originalFileName.includes(".")
    ? originalFileName.slice(originalFileName.lastIndexOf("."))
    : ".pdf";
  const prefix = FILE_NAME_PREFIX[resolved] ?? "doc";
  // Nome stile Filippo: SURNAME_prefix… → sostituisci parte dopo _
  const match = analysis.standardizedFileName.match(/^([^_]+)_(.+?)(\.[^.]+)?$/);
  if (match) {
    const surname = match[1]!;
    const monthMatch = match[2]!.match(/\s+(\d{1,2})$/);
    const monthSuffix = monthMatch ? ` ${monthMatch[1]}` : "";
    return {
      ...analysis,
      documentType: resolved,
      standardizedFileName: `${surname}_${prefix}${monthSuffix}${match[3] ?? ext}`,
    };
  }
  return {
    ...analysis,
    documentType: resolved,
    standardizedFileName: `NA_${prefix}_${Date.now()}${ext}`,
  };
}

/**
 * Remap buste negli slot liberi. Altri tipi: SEMPRE tieni il file
 * (anche se il tipo c'è già): Filippo confronta / elimina / accetta.
 */
function resolveDocumentType(
  detected: DocumentType,
  knownTypes: Set<string>,
  _typeCounts: Map<string, number>,
): DocumentType {
  if (detected === "SCONOSCIUTO") return detected;

  if (PAYSLIP_SLOTS.includes(detected)) {
    if (!knownTypes.has(detected)) return detected;
    const free = PAYSLIP_SLOTS.find((slot) => !knownTypes.has(slot));
    return free ?? detected;
  }

  return detected;
}

/**
 * Una sola pratica per cliente (stessa email mittente).
 * 2ª mail con allegati mancanti → riusa quella esistente, anche se già inviata a segreteria.
 * Nuova pratica solo se non esiste nulla per quell'email/CF (o solo pratiche ROGITATA).
 */

const POST_SECRETARY_ACTIVE = [
  "INVIATA_A_SEGRETERIA",
  "DELIBERA_REDDITUALE",
  "PERIZIA_PRESA",
  "PERIZIA_EFFETTUATA",
  "DELIBERA_FINALE",
  // legacy
  "INVIATA_IN_BANCA",
  "PERITO_NOMINATO",
] as const;
async function ensureBrokerOnApp(
  app: typeof applications.$inferSelect,
  brokerId?: string | null,
) {
  if (!brokerId || app.brokerId) return app;
  const [updated] = await db
    .update(applications)
    .set({ brokerId, updatedAt: new Date() })
    .where(eq(applications.id, app.id))
    .returning();
  return updated ?? { ...app, brokerId };
}

/**
 * True se la mail è di un utente CRM / admin (broker che inoltra documenti).
 * In quel caso NON si usa come chiave cliente: match solo per codice fiscale.
 */
export async function isStaffMailboxEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const adminEnv = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEnv && normalized === adminEnv) return true;

  const [hit] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      or(
        eq(users.email, normalized),
        eq(users.googleEmail, normalized),
      ),
    )
    .limit(1);
  return Boolean(hit);
}

async function findOrCreateApplication(params: {
  fiscalCode?: string | null;
  email?: string;
  clientName: string;
  isTest?: boolean;
  brokerId?: string | null;
}) {
  const rawEmail = params.email?.trim().toLowerCase() || null;
  const fiscalCode = params.fiscalCode?.trim().toUpperCase() || null;
  const staffSender = rawEmail ? await isStaffMailboxEmail(rawEmail) : false;
  // Mail del broker/ufficio non è l'email del cliente
  const clientEmail = staffSender ? null : rawEmail;

  // 1) Match primario: codice fiscale (anche se il mittente è Filippo con la stessa mail)
  if (fiscalCode) {
    const [byCf] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientFiscalCode, fiscalCode),
          inArray(applications.status, [
            ...OPEN_STATUSES,
            ...POST_SECRETARY_ACTIVE,
          ]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byCf) return ensureBrokerOnApp(byCf, params.brokerId);

    // 1b) CF di un cointestatario su pratica COPPIA
    const [byCoupleCf] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.isCouple, true),
          sql`${applications.applicantFiscalCodes} @> ARRAY[${fiscalCode}]::text[]`,
          inArray(applications.status, [
            ...OPEN_STATUSES,
            ...POST_SECRETARY_ACTIVE,
          ]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byCoupleCf) return ensureBrokerOnApp(byCoupleCf, params.brokerId);
  }

  // 2) Fallback email solo se mittente = cliente (non staff) e non abbiamo CF
  if (clientEmail) {
    const [byEmailOpen] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientEmail, clientEmail),
          inArray(applications.status, [...OPEN_STATUSES]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byEmailOpen) {
      let app = byEmailOpen;
      if (fiscalCode && !app.clientFiscalCode) {
        const [updated] = await db
          .update(applications)
          .set({ clientFiscalCode: fiscalCode, updatedAt: new Date() })
          .where(eq(applications.id, app.id))
          .returning();
        app = updated ?? app;
      }
      return ensureBrokerOnApp(app, params.brokerId);
    }

    const [byEmailAny] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.clientEmail, clientEmail),
          inArray(applications.status, [
            ...OPEN_STATUSES,
            ...POST_SECRETARY_ACTIVE,
          ]),
        ),
      )
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    if (byEmailAny) {
      let app = byEmailAny;
      if (fiscalCode && !app.clientFiscalCode) {
        const [updated] = await db
          .update(applications)
          .set({ clientFiscalCode: fiscalCode, updatedAt: new Date() })
          .where(eq(applications.id, app.id))
          .returning();
        app = updated ?? app;
      }
      return ensureBrokerOnApp(app, params.brokerId);
    }
  }

  const placeholderEmail = fiscalCode
    ? `cf.${fiscalCode.toLowerCase()}@prontopratica.local`
    : clientEmail ?? "sconosciuto@email.local";

  const [created] = await db
    .insert(applications)
    .values({
      clientName: params.clientName,
      clientEmail: placeholderEmail,
      clientFiscalCode: fiscalCode,
      status: "DOCUMENTI_INCOMPLETI",
      isTest: params.isTest ?? false,
      brokerId: params.brokerId ?? null,
      storageFolders: defaultStorageFolders(params.clientName),
    })
    .returning();

  return created;
}

/** Crea/riusa pratica da mail con oggetto giusto (anche senza allegati). */
export async function ensureWaitingApplication(params: {
  email: string;
  clientNameHint?: string;
  isTest?: boolean;
  brokerId?: string | null;
}) {
  return findOrCreateApplication({
    email: params.email,
    clientName: params.clientNameHint || params.email.split("@")[0] || "Cliente",
    isTest: params.isTest,
    brokerId: params.brokerId,
  });
}

/**
 * Se per errore esistono più pratiche con la stessa email, le fonde:
 * tiene quella con più documenti (o la più aggiornata) e sposta i doc delle altre.
 */
export async function mergeDuplicateOpenApplicationsByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  // Non fondere pratiche se la chiave è la mail di un broker (Filippo inoltra più clienti)
  if (await isStaffMailboxEmail(normalized)) return null;

  const candidates = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.clientEmail, normalized),
        inArray(applications.status, [
          ...OPEN_STATUSES,
          ...POST_SECRETARY_ACTIVE,
        ]),
      ),
    );

  if (candidates.length <= 1) return candidates[0] ?? null;

  const ranked = await Promise.all(
    candidates.map(async (app) => {
      const docs = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.applicationId, app.id));
      return { app, docCount: docs.length };
    }),
  );
  ranked.sort((a, b) => {
    if (b.docCount !== a.docCount) return b.docCount - a.docCount;
    return (
      new Date(b.app.updatedAt).getTime() - new Date(a.app.updatedAt).getTime()
    );
  });

  const keep = ranked[0].app;
  const dupes = ranked.slice(1).map((r) => r.app);

  for (const dupe of dupes) {
    await db
      .update(documents)
      .set({ applicationId: keep.id })
      .where(eq(documents.applicationId, dupe.id));

    const patch: Partial<typeof applications.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (!keep.clientFiscalCode && dupe.clientFiscalCode) {
      patch.clientFiscalCode = dupe.clientFiscalCode;
    }
    if (keep.clientName === "Cliente" && dupe.clientName !== "Cliente") {
      patch.clientName = dupe.clientName;
    }
    if (!keep.driveFolderId && dupe.driveFolderId) {
      patch.driveFolderId = dupe.driveFolderId;
      patch.driveFolderUrl = dupe.driveFolderUrl;
    }
    if (!keep.sentToSecretaryAt && dupe.sentToSecretaryAt) {
      patch.sentToSecretaryAt = dupe.sentToSecretaryAt;
      patch.status = dupe.status;
    }
    if (Object.keys(patch).length > 1) {
      await db
        .update(applications)
        .set(patch)
        .where(eq(applications.id, keep.id));
    }

    await db.delete(applications).where(eq(applications.id, dupe.id));
  }

  await dedupeApplicationDocuments(keep.id);
  return keep;
}

/**
 * Fondi pratiche aperte con lo stesso CF (es. cf.* + mail mittente).
 * Tiene quella con più doc; preferisce email reale al placeholder.
 */
export async function mergeDuplicateOpenApplicationsByFiscalCode(
  fiscalCode: string,
) {
  const cf = fiscalCode.trim().toUpperCase();
  if (!cf) return null;

  const candidates = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.clientFiscalCode, cf),
        inArray(applications.status, [
          ...OPEN_STATUSES,
          ...POST_SECRETARY_ACTIVE,
        ]),
      ),
    );

  if (candidates.length <= 1) return candidates[0] ?? null;

  const ranked = await Promise.all(
    candidates.map(async (app) => {
      const docs = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.applicationId, app.id));
      return { app, docCount: docs.length };
    }),
  );
  ranked.sort((a, b) => {
    if (b.docCount !== a.docCount) return b.docCount - a.docCount;
    const aReal = isPlaceholderClientEmail(a.app.clientEmail) ? 0 : 1;
    const bReal = isPlaceholderClientEmail(b.app.clientEmail) ? 0 : 1;
    if (bReal !== aReal) return bReal - aReal;
    return (
      new Date(b.app.updatedAt).getTime() - new Date(a.app.updatedAt).getTime()
    );
  });

  const keep = ranked[0]!.app;
  const dupes = ranked.slice(1).map((r) => r.app);

  for (const dupe of dupes) {
    await absorbApplicationInto(dupe.id, keep.id);
  }

  await dedupeApplicationDocuments(keep.id);
  const [fresh] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, keep.id))
    .limit(1);
  return fresh ?? keep;
}

/** Sposta tutti i doc da from → into, copia email/CF utili, elimina from. */
async function absorbApplicationInto(fromId: string, intoId: string) {
  if (fromId === intoId) return;

  const [from] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, fromId))
    .limit(1);
  const [into] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, intoId))
    .limit(1);
  if (!from || !into) return;

  await db
    .update(documents)
    .set({ applicationId: intoId })
    .where(eq(documents.applicationId, fromId));

  const patch: Partial<typeof applications.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (
    isPlaceholderClientEmail(into.clientEmail) &&
    !isPlaceholderClientEmail(from.clientEmail) &&
    !(await isStaffMailboxEmail(from.clientEmail))
  ) {
    patch.clientEmail = from.clientEmail;
  }
  if (!into.clientFiscalCode && from.clientFiscalCode) {
    patch.clientFiscalCode = from.clientFiscalCode;
  }
  if (from.isCouple || into.isCouple) {
    patch.isCouple = true;
    if (!into.coupleSubjectKey && from.coupleSubjectKey) {
      patch.coupleSubjectKey = from.coupleSubjectKey;
    }
    const codes = new Set([
      ...(into.applicantFiscalCodes ?? []),
      ...(from.applicantFiscalCodes ?? []),
      ...(into.clientFiscalCode ? [into.clientFiscalCode] : []),
      ...(from.clientFiscalCode ? [from.clientFiscalCode] : []),
    ].map((c) => c.trim().toUpperCase()).filter(Boolean));
    if (codes.size) patch.applicantFiscalCodes = [...codes];
  }
  if (
    (into.clientName === "Cliente" || into.clientName.startsWith("Intake ")) &&
    from.clientName !== "Cliente" &&
    !from.clientName.startsWith("Intake ")
  ) {
    patch.clientName = from.clientName;
  }
  if (!into.driveFolderId && from.driveFolderId) {
    patch.driveFolderId = from.driveFolderId;
    patch.driveFolderUrl = from.driveFolderUrl;
  }
  if (!into.brokerId && from.brokerId) {
    patch.brokerId = from.brokerId;
  }
  if (!into.sentToSecretaryAt && from.sentToSecretaryAt) {
    patch.sentToSecretaryAt = from.sentToSecretaryAt;
    patch.status = from.status;
  }
  if (Object.keys(patch).length > 1) {
    await db
      .update(applications)
      .set(patch)
      .where(eq(applications.id, intoId));
  }

  await db.delete(applications).where(eq(applications.id, fromId));
}

/** Fusiona tutti i doppioni per email e per CF (cleanup / cron). */
export async function mergeAllDuplicateApplications() {
  const rows = await db
    .select({
      email: applications.clientEmail,
      fiscalCode: applications.clientFiscalCode,
    })
    .from(applications);
  const emails = [
    ...new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean)),
  ];
  let mergedGroups = 0;
  for (const email of emails) {
    const before = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.clientEmail, email));
    if (before.length > 1) {
      await mergeDuplicateOpenApplicationsByEmail(email);
      mergedGroups += 1;
    }
  }

  const codes = [
    ...new Set(
      rows
        .map((r) => r.fiscalCode?.trim().toUpperCase())
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  for (const cf of codes) {
    const before = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.clientFiscalCode, cf));
    if (before.length > 1) {
      await mergeDuplicateOpenApplicationsByFiscalCode(cf);
      mergedGroups += 1;
    }
  }

  // Pratiche senza CF ma stesso nominativo di una con CF (es. mail intake + OCR)
  const openApps = await db
    .select()
    .from(applications)
    .where(
      inArray(applications.status, [
        ...OPEN_STATUSES,
        ...POST_SECRETARY_ACTIVE,
      ]),
    );
  const withCf = openApps.filter((a) => a.clientFiscalCode?.trim());
  const withoutCf = openApps.filter((a) => !a.clientFiscalCode?.trim());
  for (const orphan of withoutCf) {
    const nameKey = orphan.clientName.trim().toLowerCase();
    if (
      !nameKey ||
      nameKey === "cliente" ||
      nameKey.startsWith("intake ")
    ) {
      continue;
    }
    const match = withCf.find(
      (a) =>
        a.id !== orphan.id &&
        a.clientName.trim().toLowerCase() === nameKey,
    );
    if (!match) continue;
    await absorbApplicationInto(orphan.id, match.id);
    mergedGroups += 1;
  }

  // Pratiche aperte senza alcun documento = spazzatura intake
  for (const app of openApps) {
    const [still] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, app.id))
      .limit(1);
    if (!still) continue;
    const docs = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.applicationId, app.id))
      .limit(1);
    if (docs.length === 0 && isPlaceholderClientEmail(app.clientEmail)) {
      await db.delete(applications).where(eq(applications.id, app.id));
      mergedGroups += 1;
    }
  }

  return { emailsChecked: emails.length, cfChecked: codes.length, mergedGroups };
}

/**
 * Elimina solo file grezzi identici (stesso rawFileName).
 * NON cancella più due STATO_FAMIGLIA / CERTIFICATO_RESIDENZA diversi:
 * restano entrambi, Filippo sceglie.
 */
export async function dedupeApplicationDocuments(applicationId: string) {
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId))
    .orderBy(desc(documents.createdAt));

  const seenRaw = new Set<string>();
  const toDelete: string[] = [];

  for (const doc of docs) {
    const rawKey = doc.rawFileName.trim().toLowerCase();
    if (seenRaw.has(rawKey)) {
      toDelete.push(doc.id);
      continue;
    }
    seenRaw.add(rawKey);
  }

  if (toDelete.length > 0) {
    await db.delete(documents).where(inArray(documents.id, toDelete));
  }

  return toDelete.length;
}

export async function processIncomingFiles(
  files: IncomingFile[],
  options?: {
    applicationId?: string;
    isTest?: boolean;
    /** Titolare pratica (casella da cui è arrivata la mail). */
    brokerId?: string | null;
  },
) {
  if (files.length === 0) {
    return { processed: 0, applicationIds: [] as string[], errors: [] as string[] };
  }

  // Se applicationId noto: salta file già presenti (niente Gemini inutile)
  let knownRaw = new Set<string>();
  let knownTypes = new Set<string>();
  let typeCounts = new Map<string, number>();
  if (options?.applicationId) {
    await dedupeApplicationDocuments(options.applicationId);
    const existing = await db
      .select({
        rawFileName: documents.rawFileName,
        documentType: documents.documentType,
      })
      .from(documents)
      .where(eq(documents.applicationId, options.applicationId));
    knownRaw = new Set(existing.map((d) => d.rawFileName.trim().toLowerCase()));
    knownTypes = new Set(
      existing
        .filter((d) => d.documentType !== "SCONOSCIUTO")
        .map((d) => d.documentType),
    );
    typeCounts = new Map<string, number>();
    for (const d of existing) {
      if (d.documentType === "SCONOSCIUTO") continue;
      typeCounts.set(
        d.documentType,
        (typeCounts.get(d.documentType) ?? 0) + 1,
      );
    }
  }

  const errors: string[] = [];
  const applicationIds = new Set<string>();
  let processed = 0;

  function trackType(type: DocumentType) {
    if (type === "SCONOSCIUTO") return;
    knownTypes.add(type);
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }

  for (const file of files) {
    const rawKey = file.originalFileName.trim().toLowerCase();
    if (knownRaw.has(rawKey)) {
      errors.push(
        `${file.originalFileName}: già in pratica con lo stesso nome — rinomina e riprova`,
      );
      continue;
    }
    knownRaw.add(rawKey);

    let analysis;
    try {
      analysis = await analyzeDocument({
        buffer: file.buffer,
        mimeType: file.mimeType,
        originalFileName: file.originalFileName,
      });
    } catch (reason) {
      const msg =
        reason instanceof Error ? reason.message : String(reason);
      errors.push(`${file.originalFileName}: ${msg}`);
      console.error("analyze failed", file.originalFileName, msg);
      continue;
    }

    // Remap buste negli slot; tipi già presenti restano (Filippo confronta)
    if (options?.applicationId) {
      const wasDup =
        analysis.documentType !== "SCONOSCIUTO" &&
        knownTypes.has(analysis.documentType) &&
        !PAYSLIP_SLOTS.includes(analysis.documentType);
      const resolved = resolveDocumentType(
        analysis.documentType,
        knownTypes,
        typeCounts,
      );
      analysis = withResolvedType(
        analysis,
        resolved,
        file.originalFileName,
      );
      if (wasDup) {
        analysis = {
          ...analysis,
          validationIssues: [
            ...analysis.validationIssues,
            `Stesso tipo già in pratica: confronta date e tieni il più recente/completo, oppure elimina la copia.`,
          ],
        };
      }
    }

    const clientName =
      [analysis.extractedData.lastName, analysis.extractedData.firstName]
        .filter(Boolean)
        .join(" ") ||
      file.clientNameHint ||
      "Cliente";

    let app;
    if (options?.applicationId) {
      const [existing] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, options.applicationId))
        .limit(1);
      app = existing;
    }

    if (!app) {
      if (file.clientEmail) {
        await mergeDuplicateOpenApplicationsByEmail(file.clientEmail);
      }

      // Match per CF dal documento; la mail mittente conta solo se non è di uno staff.
      // Autoinvio da casella OAuth = pratica normale (niente isTest automatico).
      app = await findOrCreateApplication({
        fiscalCode: analysis.extractedData.fiscalCode,
        email: file.clientEmail,
        clientName,
        isTest: options?.isTest === true,
        brokerId: options?.brokerId,
      });

      // Dopo aver trovato la pratica, ricarica i già presenti
      await dedupeApplicationDocuments(app.id);
      const existing = await db
        .select({
          rawFileName: documents.rawFileName,
          documentType: documents.documentType,
        })
        .from(documents)
        .where(eq(documents.applicationId, app.id));
      knownRaw = new Set(
        existing.map((d) => d.rawFileName.trim().toLowerCase()),
      );
      knownTypes = new Set(
        existing
          .filter((d) => d.documentType !== "SCONOSCIUTO")
          .map((d) => d.documentType),
      );
      typeCounts = new Map<string, number>();
      for (const d of existing) {
        if (d.documentType === "SCONOSCIUTO") continue;
        typeCounts.set(
          d.documentType,
          (typeCounts.get(d.documentType) ?? 0) + 1,
        );
      }

      if (knownRaw.has(rawKey)) {
        applicationIds.add(app.id);
        continue;
      }

      const wasDup =
        analysis.documentType !== "SCONOSCIUTO" &&
        knownTypes.has(analysis.documentType) &&
        !PAYSLIP_SLOTS.includes(analysis.documentType);
      const resolved = resolveDocumentType(
        analysis.documentType,
        knownTypes,
        typeCounts,
      );
      analysis = withResolvedType(
        analysis,
        resolved,
        file.originalFileName,
      );
      if (wasDup) {
        analysis = {
          ...analysis,
          validationIssues: [
            ...analysis.validationIssues,
            `Stesso tipo già in pratica: confronta date e tieni il più recente/completo, oppure elimina la copia.`,
          ],
        };
      }
    }

    const updates: Partial<typeof applications.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (!app.clientFiscalCode && analysis.extractedData.fiscalCode) {
      updates.clientFiscalCode = analysis.extractedData.fiscalCode.toUpperCase();
    }
    if (app.clientName === "Cliente" && clientName !== "Cliente") {
      updates.clientName = clientName;
    }
    if (Object.keys(updates).length > 1) {
      await db
        .update(applications)
        .set(updates)
        .where(eq(applications.id, app.id));
      app = { ...app, ...updates } as typeof app;
    }

    const folderPrefix = practiceStoragePrefix(app.id);
    const folderUrl: string = `${getAppBaseUrl()}/dashboard/applications/${app.id}#files`;
    if (!app.driveFolderId) {
      await db
        .update(applications)
        .set({
          driveFolderId: folderPrefix,
          driveFolderUrl: folderUrl,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));
      app = {
        ...app,
        driveFolderId: folderPrefix,
        driveFolderUrl: folderUrl,
      } as typeof app;
    }

    const folderKind = storageFolderKindForDocument(analysis.documentType);
    const subfolder = storageSubfolderLabel(folderKind, app.clientName);

    let storageKey: string | null = null;
    try {
      const uploaded = await uploadPracticeFile({
        applicationId: app.id,
        subfolder,
        fileName: analysis.standardizedFileName,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });
      storageKey = uploaded.pathname;
      if (file.incomingStorageKey) {
        try {
          await deleteBlobByPathname(file.incomingStorageKey);
        } catch (delErr) {
          console.error("cleanup incoming R2 key", delErr);
        }
      }
    } catch (err) {
      console.error("R2 upload failed", err);
      errors.push(
        `${file.originalFileName}: upload storage fallito   ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const [inserted] = await db
      .insert(documents)
      .values({
        applicationId: app.id,
        rawFileName: file.originalFileName,
        renamedFileName: analysis.standardizedFileName,
        documentType: analysis.documentType,
        driveFileId: storageKey,
        driveFileUrl: null,
        storageSubfolder: subfolder,
        isValid: analysis.isValid,
        analysisStatus: "done",
        extractedData: analysis.extractedData,
        validationIssues: analysis.validationIssues,
      })
      .returning({ id: documents.id });

    if (inserted && storageKey) {
      await db
        .update(documents)
        .set({ driveFileUrl: `/api/files/${inserted.id}` })
        .where(eq(documents.id, inserted.id));
    }

    knownRaw.add(rawKey);
    trackType(analysis.documentType);
    processed += 1;
    applicationIds.add(app.id);
  }

  for (const applicationId of applicationIds) {
    await refreshApplicationState(applicationId);
  }

  return {
    processed,
    applicationIds: [...applicationIds],
    errors,
  };
}

/** Dopo PUT diretto su R2: scarica, Gemini, salva path finale. */
export async function processDirectUploads(
  items: Array<{
    storageKey: string;
    mimeType: string;
    originalFileName: string;
  }>,
  options: {
    applicationId: string;
    brokerId?: string;
    subfolder?: string;
  },
) {
  const incoming: IncomingFile[] = [];
  const loadErrors: string[] = [];

  const loaded = await Promise.all(
    items.map(async (item) => {
      try {
        const { buffer } = await downloadBlob(item.storageKey);
        return {
          ok: true as const,
          file: {
            buffer,
            mimeType: item.mimeType,
            originalFileName: item.originalFileName,
            incomingStorageKey: item.storageKey,
          } satisfies IncomingFile,
        };
      } catch (err) {
        return {
          ok: false as const,
          error: `${item.originalFileName}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }
    }),
  );

  for (const row of loaded) {
    if (row.ok) incoming.push(row.file);
    else loadErrors.push(row.error);
  }

  const result = await processIncomingFiles(incoming, {
    applicationId: options.applicationId,
    brokerId: options.brokerId,
  });

  if (options.subfolder) {
    for (const item of items) {
      await db
        .update(documents)
        .set({ storageSubfolder: options.subfolder })
        .where(
          and(
            eq(documents.applicationId, options.applicationId),
            eq(documents.rawFileName, item.originalFileName),
          ),
        );
    }
  }

  return {
    ...result,
    errors: [...loadErrors, ...result.errors],
  };
}

/** Una sola cartella "{COGNOME} DOC" per pratica (niente INFOINZAGO/SHEHATA DOC sparsi). */
export async function normalizePracticeDocFolders(applicationId: string) {
  const [app] = await db
    .select({ id: applications.id, clientName: applications.clientName })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return;

  const canonicalDoc = storageSubfolderLabel("DOC", app.clientName);
  const docs = await db
    .select({
      id: documents.id,
      storageSubfolder: documents.storageSubfolder,
      documentType: documents.documentType,
    })
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  for (const doc of docs) {
    const folder = (doc.storageSubfolder ?? "").trim();
    const isStrayDocFolder =
      / DOC$/i.test(folder) &&
      folder.toUpperCase() !== canonicalDoc.toUpperCase();
    const kind = storageFolderKindForDocument(doc.documentType);
    if (kind === "DOC" && (isStrayDocFolder || !folder)) {
      await db
        .update(documents)
        .set({ storageSubfolder: canonicalDoc })
        .where(eq(documents.id, doc.id));
    }
  }

  const folders = defaultStorageFolders(app.clientName);
  await db
    .update(applications)
    .set({ storageFolders: folders, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
}

export async function refreshApplicationState(applicationId: string) {
  await normalizePracticeDocFolders(applicationId);
  await dedupeApplicationDocuments(applicationId);

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return;

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  const employmentType = inferEmploymentType(docs);
  const coherenceIssues = checkAnagraphicCoherence(docs, {
    isCouple: app.isCouple,
  });
  const preScoring = computePreScoring(docs);
  if (coherenceIssues.length) {
    preScoring.notes = [...(preScoring.notes ?? []), ...coherenceIssues];
  }
  if (app.isCouple) {
    const coupleNotes = coupleCoherenceNotes(docs);
    if (coupleNotes.length) {
      preScoring.notes = [...(preScoring.notes ?? []), ...coupleNotes];
    }
  }

  let nextStatus = deriveApplicationStatus(
    app.requiredDocumentTypes,
    docs,
    app.status,
  );

  if (coherenceIssues.length && nextStatus === "COMPLETA_DA_INOLTRARE") {
    nextStatus = "DOCUMENTI_INCOMPLETI";
  }

  // Tipi presenti → checklist, ma solo anagrafica + categoria lavorativa inferita + ulteriore
  // (CU/estratto non “accendono” anche pensionato/autonomo)
  const incomePreset = new Set(
    CHECKLIST_PRESETS[employmentType] ?? CHECKLIST_PRESETS.DIPENDENTE_INDETERMINATO,
  );
  const anagraficaTypes = new Set(
    SHEET_SECTIONS.find((s) => s.title === "DOCUMENTAZIONE ANAGRAFICA")?.items.flatMap(
      (i) => i.types,
    ) ?? [],
  );
  const ulterioreTypes = new Set(
    SHEET_SECTIONS.find((s) => s.title === "ULTERIORE DOCUMENTAZIONE")?.items.flatMap(
      (i) => i.types,
    ) ?? [],
  );
  const allowedAuto = new Set<DocumentType>([
    ...incomePreset,
    ...anagraficaTypes,
    ...ulterioreTypes,
  ]);

  const requiredSet = new Set(app.requiredDocumentTypes ?? []);
  let requiredChanged = false;
  for (const d of docs) {
    const candidates: DocumentType[] = [];
    if (d.documentType && d.documentType !== "SCONOSCIUTO") {
      candidates.push(d.documentType);
    }
    for (const t of d.extractedData?.alsoCovers ?? []) {
      if (t && t !== "SCONOSCIUTO") candidates.push(t);
    }
    for (const t of candidates) {
      if (allowedAuto.has(t) && !requiredSet.has(t)) {
        requiredSet.add(t);
        requiredChanged = true;
      }
    }
  }
  const requiredDocumentTypes = [...requiredSet] as DocumentType[];

  const statusUnchanged = !nextStatus || nextStatus === app.status;
  const scoringUnchanged =
    JSON.stringify(app.preScoringData ?? null) === JSON.stringify(preScoring);
  const employmentUnchanged = app.employmentType === employmentType;

  if (
    !statusUnchanged ||
    !scoringUnchanged ||
    !employmentUnchanged ||
    requiredChanged
  ) {
    await db
      .update(applications)
      .set({
        employmentType,
        preScoringData: preScoring,
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(requiredChanged ? { requiredDocumentTypes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));
  }

  const checklist = evaluateChecklist(requiredDocumentTypes, docs);
  const hasRelazione = Boolean(app.relazioneStorageKey);
  if (checklist.isComplete && !coherenceIssues.length && hasRelazione) {
    const [settings] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, "global"))
      .limit(1);

    const autoSend = settings?.autoSendToSecretary ?? true;
    const alreadySent = Boolean(app.sentToSecretaryAt);

    if (autoSend && !alreadySent) {
      try {
        await sendApplicationToSecretary(applicationId, {
          actorName: "Sistema (auto)",
          regenerateToken: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("auto send secretary failed", err);
        await setApplicationPipelineError(
          applicationId,
          `Invio automatico segreteria fallito: ${msg}`,
        );
        void notifySecretarySendFailed({
          applicationId,
          errorMessage: msg,
        }).catch((e) => console.error("notify send fail mail", e));
      }
    }
  }
}

function mimeFromFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function isIntakeStagingEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.startsWith("intake.") && e.endsWith("@prontopratica.local");
}

async function findOpenCoupleBySubjectKey(key: string) {
  const [found] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.isCouple, true),
        eq(applications.coupleSubjectKey, key),
        inArray(applications.status, [
          ...OPEN_STATUSES,
          ...POST_SECRETARY_ACTIVE,
        ]),
      ),
    )
    .orderBy(desc(applications.updatedAt))
    .limit(1);
  return found ?? null;
}

async function addApplicantFiscalCode(
  applicationId: string,
  fiscalCode: string,
) {
  const cf = fiscalCode.trim().toUpperCase();
  if (!cf || cf.length < 11) return;
  const [row] = await db
    .select({
      clientFiscalCode: applications.clientFiscalCode,
      applicantFiscalCodes: applications.applicantFiscalCodes,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!row) return;
  const codes = new Set(
    (row.applicantFiscalCodes ?? []).map((c) => c.trim().toUpperCase()),
  );
  codes.add(cf);
  await db
    .update(applications)
    .set({
      applicantFiscalCodes: [...codes],
      clientFiscalCode: row.clientFiscalCode ?? cf,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));
}

/** Pratica temporanea per mail staff (match solo dopo OCR/CF). */
async function ensureStagingApplication(params: {
  messageId: string;
  clientNameHint?: string;
  isTest?: boolean;
  brokerId?: string | null;
  isCouple?: boolean;
  coupleSubjectKey?: string | null;
}) {
  // Mail successive stessa coppia → stessa pratica (niente staging nuovo)
  if (params.isCouple && params.coupleSubjectKey) {
    const existingCouple = await findOpenCoupleBySubjectKey(
      params.coupleSubjectKey,
    );
    if (existingCouple) {
      return ensureBrokerOnApp(existingCouple, params.brokerId);
    }
  }

  const safeId = params.messageId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  const stagingEmail = `intake.${safeId || Date.now()}@prontopratica.local`;
  const [existing] = await db
    .select()
    .from(applications)
    .where(eq(applications.clientEmail, stagingEmail))
    .limit(1);
  if (existing) return ensureBrokerOnApp(existing, params.brokerId);

  const name =
    params.clientNameHint?.trim() ||
    (params.isCouple
      ? "Coppia"
      : `Intake ${safeId.slice(0, 8) || "mail"}`);
  const [created] = await db
    .insert(applications)
    .values({
      clientName: name,
      clientEmail: stagingEmail,
      status: "DOCUMENTI_INCOMPLETI",
      isTest: params.isTest ?? false,
      isCouple: params.isCouple ?? false,
      coupleSubjectKey: params.coupleSubjectKey ?? null,
      brokerId: params.brokerId ?? null,
      storageFolders: defaultStorageFolders(name),
    })
    .returning();
  return created;
}

/**
 * Intake email senza Gemini: salva allegati su R2 + doc pending.
 * Così il cron risponde entro il timeout di cron-job.org (~30s).
 */
export async function ingestEmailAttachmentsWithoutAi(
  files: Array<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }>,
  options: {
    fromEmail: string;
    messageId: string;
    subject?: string;
    clientNameHint?: string;
    isTest?: boolean;
    brokerId?: string | null;
  },
) {
  if (files.length === 0) {
    return {
      stored: 0,
      skipped: 0,
      applicationId: null as string | null,
      errors: [] as string[],
    };
  }

  const subject = options.subject ?? "";
  const isCouple = isCoupleEmailSubject(subject);
  const coupleKey = coupleSubjectKey(subject);
  const coupleHint = coupleNameHintFromSubject(subject);

  // Niente match sulla From:. Staging per messageId → merge CF in OCR.
  // COPPIA: riusa pratica con stesso oggetto / crea pratica isCouple.
  const app = await ensureStagingApplication({
    messageId: options.messageId,
    clientNameHint: coupleHint || options.clientNameHint,
    isTest: options.isTest,
    brokerId: options.brokerId,
    isCouple,
    coupleSubjectKey: coupleKey,
  });

  const existing = await db
    .select({ rawFileName: documents.rawFileName })
    .from(documents)
    .where(eq(documents.applicationId, app.id));
  const knownRaw = new Set(
    existing.map((d) => d.rawFileName.trim().toLowerCase()),
  );

  const folderPrefix = practiceStoragePrefix(app.id);
  const folderUrl = `${getAppBaseUrl()}/dashboard/applications/${app.id}#files`;
  if (!app.driveFolderId) {
    await db
      .update(applications)
      .set({
        driveFolderId: folderPrefix,
        driveFolderUrl: folderUrl,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, app.id));
  }

  const subfolder = storageSubfolderLabel("DOC", app.clientName);
  const errors: string[] = [];
  let stored = 0;
  let skipped = 0;

  for (const file of files) {
    const rawKey = file.filename.trim().toLowerCase();
    if (knownRaw.has(rawKey)) {
      skipped += 1;
      continue;
    }

    let storageKey: string | null = null;
    try {
      const uploaded = await uploadPracticeFile({
        applicationId: app.id,
        subfolder,
        fileName: file.filename,
        mimeType: file.mimeType || mimeFromFileName(file.filename),
        buffer: file.buffer,
      });
      storageKey = uploaded.pathname;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${file.filename}: upload fallito — ${msg}`);
      console.error("intake R2 upload failed", file.filename, msg);
      continue;
    }

    const [inserted] = await db
      .insert(documents)
      .values({
        applicationId: app.id,
        rawFileName: file.filename,
        renamedFileName: file.filename,
        documentType: "SCONOSCIUTO",
        driveFileId: storageKey,
        driveFileUrl: null,
        storageSubfolder: subfolder,
        isValid: false,
        analysisStatus: "pending",
        extractedData: null,
        validationIssues: [],
      })
      .returning({ id: documents.id });

    if (inserted && storageKey) {
      await db
        .update(documents)
        .set({ driveFileUrl: `/api/files/${inserted.id}` })
        .where(eq(documents.id, inserted.id));
    }

    knownRaw.add(rawKey);
    stored += 1;
  }

  if (stored > 0) {
    await db
      .update(applications)
      .set({ updatedAt: new Date() })
      .where(eq(applications.id, app.id));
    try {
      const { markOcrPending } = await import("@/lib/cron/neon-gate");
      await markOcrPending();
    } catch (flagErr) {
      console.error("markOcrPending", flagErr);
    }
  }

  return {
    stored,
    skipped,
    applicationId: app.id,
    errors,
  };
}

/**
 * Analizza fino a `limit` documenti in coda (pending).
 * Un file per volta: adatto al timeout 30s di cron-job.org.
 */
export async function processPendingDocumentAnalyses(limit = 2) {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  await db
    .update(documents)
    .set({ analysisStatus: "pending", analysisClaimedAt: null })
    .where(
      and(
        eq(documents.analysisStatus, "processing"),
        lt(documents.analysisClaimedAt, staleBefore),
      ),
    );

  // Riprova i falliti (quota Gemini / timeout precedenti)
  await db
    .update(documents)
    .set({ analysisStatus: "pending", analysisClaimedAt: null })
    .where(eq(documents.analysisStatus, "failed"));

  const candidates = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.analysisStatus, "pending"),
        eq(documents.filePurged, false),
      ),
    )
    .orderBy(asc(documents.createdAt))
    .limit(Math.max(1, limit));

  const results: Array<{
    documentId: string;
    ok: boolean;
    applicationId?: string;
    error?: string;
  }> = [];

  for (const row of candidates) {
    const claimed = await db
      .update(documents)
      .set({
        analysisStatus: "processing",
        analysisClaimedAt: new Date(),
      })
      .where(
        and(
          eq(documents.id, row.id),
          eq(documents.analysisStatus, "pending"),
        ),
      )
      .returning();

    if (claimed.length === 0) continue;
    const doc = claimed[0]!;

    try {
      if (!doc.driveFileId) {
        await db
          .update(documents)
          .set({
            analysisStatus: "failed",
            analysisClaimedAt: null,
            validationIssues: ["File senza storage key"],
          })
          .where(eq(documents.id, doc.id));
        results.push({
          documentId: doc.id,
          ok: false,
          error: "missing storage",
        });
        continue;
      }

      const { buffer } = await downloadBlob(doc.driveFileId);
      const mimeType = mimeFromFileName(doc.rawFileName);
      const analysis = await analyzeDocument({
        buffer,
        mimeType,
        originalFileName: doc.rawFileName,
      });

      const [currentApp] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, doc.applicationId))
        .limit(1);
      if (!currentApp) {
        await db
          .update(documents)
          .set({
            analysisStatus: "failed",
            analysisClaimedAt: null,
            validationIssues: ["Pratica non trovata"],
          })
          .where(eq(documents.id, doc.id));
        results.push({
          documentId: doc.id,
          ok: false,
          error: "missing application",
        });
        continue;
      }

      const staging = isIntakeStagingEmail(currentApp.clientEmail);
      const personName =
        [analysis.extractedData.lastName, analysis.extractedData.firstName]
          .filter(Boolean)
          .join(" ") || currentApp.clientName;

      // Pratica COPPIA: tutti i file restano insieme (niente split per CF)
      let targetApp = currentApp;
      if (!currentApp.isCouple) {
        targetApp = await findOrCreateApplication({
          fiscalCode: analysis.extractedData.fiscalCode,
          email: staging ? undefined : currentApp.clientEmail,
          clientName: personName,
          isTest: currentApp.isTest,
          brokerId: currentApp.brokerId,
        });
      }

      await dedupeApplicationDocuments(targetApp.id);
      const siblings = await db
        .select({
          id: documents.id,
          rawFileName: documents.rawFileName,
          documentType: documents.documentType,
        })
        .from(documents)
        .where(eq(documents.applicationId, targetApp.id));

      const knownTypes = new Set(
        siblings
          .filter(
            (d) =>
              d.id !== doc.id &&
              d.documentType !== "SCONOSCIUTO" &&
              d.documentType,
          )
          .map((d) => d.documentType),
      );
      const typeCounts = new Map<string, number>();
      for (const d of siblings) {
        if (d.id === doc.id || d.documentType === "SCONOSCIUTO") continue;
        typeCounts.set(
          d.documentType,
          (typeCounts.get(d.documentType) ?? 0) + 1,
        );
      }

      const wasDup =
        analysis.documentType !== "SCONOSCIUTO" &&
        knownTypes.has(analysis.documentType) &&
        !PAYSLIP_SLOTS.includes(analysis.documentType);
      const resolved = resolveDocumentType(
        analysis.documentType,
        knownTypes,
        typeCounts,
      );
      let finalAnalysis = withResolvedType(
        analysis,
        resolved,
        doc.rawFileName,
      );
      if (wasDup) {
        finalAnalysis = {
          ...finalAnalysis,
          validationIssues: [
            ...finalAnalysis.validationIssues,
            `Stesso tipo già in pratica (${finalAnalysis.documentType}): entrambi restano visibili — confronta, tieni il più recente/completo o elimina la copia.`,
          ],
        };
      }

      const appUpdates: Partial<typeof applications.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (!targetApp.clientFiscalCode && finalAnalysis.extractedData.fiscalCode) {
        appUpdates.clientFiscalCode =
          finalAnalysis.extractedData.fiscalCode.toUpperCase();
      }
      if (targetApp.isCouple) {
        appUpdates.clientName = mergeCoupleClientName(
          targetApp.clientName,
          finalAnalysis.extractedData.lastName,
          finalAnalysis.extractedData.firstName,
        );
      } else if (
        (targetApp.clientName === "Cliente" ||
          targetApp.clientName.startsWith("Intake ") ||
          isIntakeStagingEmail(targetApp.clientEmail)) &&
        personName !== "Cliente"
      ) {
        appUpdates.clientName = personName;
      }
      if (Object.keys(appUpdates).length > 1) {
        await db
          .update(applications)
          .set(appUpdates)
          .where(eq(applications.id, targetApp.id));
      }
      if (
        targetApp.isCouple &&
        finalAnalysis.extractedData.fiscalCode?.trim()
      ) {
        await addApplicantFiscalCode(
          targetApp.id,
          finalAnalysis.extractedData.fiscalCode,
        );
      }

      const folderKind = storageFolderKindForDocument(
        finalAnalysis.documentType,
      );
      const subfolder = storageSubfolderLabel(
        folderKind,
        appUpdates.clientName ?? targetApp.clientName,
      );

      let storageKey = doc.driveFileId;
      try {
        const uploaded = await uploadPracticeFile({
          applicationId: targetApp.id,
          subfolder,
          fileName: finalAnalysis.standardizedFileName,
          mimeType,
          buffer,
        });
        if (doc.driveFileId && doc.driveFileId !== uploaded.pathname) {
          try {
            await deleteBlobByPathname(doc.driveFileId);
          } catch (delErr) {
            console.error("cleanup old intake key", delErr);
          }
        }
        storageKey = uploaded.pathname;
      } catch (err) {
        console.error("re-upload after OCR failed", err);
      }

      await db
        .update(documents)
        .set({
          applicationId: targetApp.id,
          renamedFileName: finalAnalysis.standardizedFileName,
          documentType: finalAnalysis.documentType,
          driveFileId: storageKey,
          driveFileUrl: `/api/files/${doc.id}`,
          storageSubfolder: subfolder,
          isValid: finalAnalysis.isValid,
          analysisStatus: "done" satisfies DocumentAnalysisStatus,
          analysisClaimedAt: null,
          extractedData: finalAnalysis.extractedData,
          validationIssues: finalAnalysis.validationIssues,
        })
        .where(eq(documents.id, doc.id));

      if (targetApp.id !== currentApp.id && !currentApp.isCouple) {
        await absorbApplicationInto(currentApp.id, targetApp.id);
      }
      const cfDone = finalAnalysis.extractedData.fiscalCode?.trim();
      // Su pratica coppia non fondere con pratiche single di un solo CF
      if (cfDone && !targetApp.isCouple) {
        await mergeDuplicateOpenApplicationsByFiscalCode(cfDone);
      }

      await refreshApplicationState(targetApp.id);
      results.push({
        documentId: doc.id,
        ok: true,
        applicationId: targetApp.id,
      });
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error("processPendingDocumentAnalyses", doc.id, msg);
      await db
        .update(documents)
        .set({
          analysisStatus: "failed",
          analysisClaimedAt: null,
          validationIssues: [msg.slice(0, 500)],
        })
        .where(eq(documents.id, doc.id));
      results.push({ documentId: doc.id, ok: false, error: msg });
    }
  }

  try {
    const { syncOcrPendingFlagFromDb } = await import("@/lib/cron/neon-gate");
    await syncOcrPendingFlagFromDb();
  } catch (flagErr) {
    console.error("syncOcrPendingFlagFromDb", flagErr);
  }

  return {
    attempted: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

