"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  documents,
  systemSettings,
  users,
  type ApplicationStatus,
  type DocumentType,
} from "@/db/schema";
import { requireAdmin, requireSession } from "@/lib/auth";
import { processIncomingFiles, refreshApplicationState } from "@/lib/pipeline";
import {
  regeneratePackageToken,
  sendApplicationToSecretary,
} from "@/lib/google/secretary-sender";
import { evaluateChecklist } from "@/lib/checklist";
import {
  COPPIA_DEFAULT_FOLDERS,
  defaultStorageFolders,
} from "@/lib/config/documents";
import { buildSollecitoMessage } from "@/lib/sollecito";
import { setApplicationPipelineError } from "@/lib/applications/errors";
import {
  deleteBlobByPathname,
  deletePracticeBlobs,
  uploadRelazioneFile,
} from "@/lib/storage/blob";
import { isSiteStorageKey } from "@/lib/storage/paths";
import {
  notifyBrokerAssigned,
  notifySecretarySendFailed,
} from "@/lib/notify/broker-mail";
import { parseEuroExpression } from "@/lib/economics";

export async function assignBrokerAction(
  applicationId: string,
  brokerId: string | null,
) {
  await requireAdmin();

  if (brokerId) {
    const [broker] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, brokerId))
      .limit(1);
    if (!broker || broker.role !== "BROKER") {
      return { error: "Seleziona un utente con ruolo Broker" };
    }
  }

  const [before] = await db
    .select({ brokerId: applications.brokerId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  await db
    .update(applications)
    .set({
      brokerId: brokerId || null,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  if (brokerId && brokerId !== before?.brokerId) {
    void notifyBrokerAssigned({ applicationId, brokerId }).catch((err) =>
      console.error("notify assign failed", err),
    );
  }

  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateApplicationStatusAction(
  applicationId: string,
  status: ApplicationStatus,
) {
  await requireSession();
  const allowed: ApplicationStatus[] = [
    "DOCUMENTI_INCOMPLETI",
    "COMPLETA_DA_INOLTRARE",
    "INVIATA_IN_BANCA",
    "DELIBERATA",
    "PERIZIA_INCARICATA",
    "PREPARAZIONE_ATTO",
    "DELIBERA_FINALE",
    "ROGITATA",
    "IN_ATTESA_RISCONTRO_CLIENTE",
    // Legacy
    "INVIATA_A_SEGRETERIA",
    "DELIBERA_REDDITUALE",
    "PERIZIA_PRESA",
    "PERIZIA_EFFETTUATA",
    "PERITO_NOMINATO",
  ];
  if (!allowed.includes(status)) {
    return { error: "Stato non consentito" };
  }

  const [current] = await db
    .select({ status: applications.status, rogitoAt: applications.rogitoAt })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  const patch: {
    status: ApplicationStatus;
    updatedAt: Date;
    rogitoAt?: Date;
  } = { status, updatedAt: new Date() };

  if (status === "ROGITATA" && !current?.rogitoAt) {
    patch.rogitoAt = new Date();
  }

  await db
    .update(applications)
    .set(patch)
    .where(eq(applications.id, applicationId));
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rogitate");
  return { ok: true };
}

export async function sendToSecretaryAction(
  applicationId: string,
  options?: {
    documentIds?: string[];
    subject?: string;
    bodyText?: string;
  },
) {
  const session = await requireSession();
  try {
    const result = await sendApplicationToSecretary(applicationId, {
      actorUserId: session.id,
      actorName: session.name,
      regenerateToken: true,
      documentIds: options?.documentIds,
      subject: options?.subject,
      bodyText: options?.bodyText,
    });
    revalidatePath(`/dashboard/applications/${applicationId}`);
    revalidatePath("/dashboard");
    return {
      ok: true as const,
      packageUrl: result.packageUrl,
      documents: result.documents,
      legacySkipped: result.legacySkipped,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invio fallito";
    await setApplicationPipelineError(applicationId, `Invio segreteria: ${msg}`);
    void notifySecretarySendFailed({
      applicationId,
      errorMessage: msg,
    }).catch((e) => console.error("notify send fail mail", e));
    revalidatePath(`/dashboard/applications/${applicationId}`);
    revalidatePath("/dashboard");
    return { error: msg };
  }
}

/** Solo admin: nasconde/mostra pratica test (lista broker). */
export async function setApplicationTestAction(
  applicationId: string,
  isTest: boolean,
) {
  await requireAdmin();
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  await db
    .update(applications)
    .set({ isTest, updatedAt: new Date() })
    .where(eq(applications.id, applicationId));
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/files");
  return { ok: true as const, isTest };
}

/** Nuovo token + 7 giorni, senza reinviare email. */
export async function regeneratePackageLinkAction(applicationId: string) {
  await requireSession();
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  try {
    const result = await regeneratePackageToken(applicationId);
    revalidatePath(`/dashboard/applications/${applicationId}`);
    return {
      ok: true as const,
      packageUrl: result.packageUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Rigenerazione fallita",
    };
  }
}

/** Elimina pratica + documenti DB + file R2. Solo admin. */
export async function deleteApplicationAction(applicationId: string) {
  await requireAdmin();
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  try {
    await deletePracticeBlobs(applicationId);
  } catch (err) {
    console.error("blob delete on application remove", err);
  }

  await db.delete(applications).where(eq(applications.id, applicationId));
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadRelazioneAction(
  applicationId: string,
  formData: FormData,
) {
  await requireSession();
  const file = formData.get("relazione") as File | null;
  if (!file || file.size === 0) {
    return { error: "Seleziona un file PDF relazione" };
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const uploaded = await uploadRelazioneFile({
      applicationId,
      clientName: app.clientName,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      buffer,
    });

    await db
      .update(applications)
      .set({
        relazioneStorageKey: uploaded.pathname,
        relazioneFileName: uploaded.pathname.split("/").pop() ?? file.name,
        relazioneUploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    await refreshApplicationState(applicationId);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Upload relazione fallito";
    await setApplicationPipelineError(applicationId, `Relazione: ${msg}`);
    return { error: msg };
  }

  await setApplicationPipelineError(applicationId, null);
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadDocumentsAction(
  applicationId: string,
  formData: FormData,
) {
  const session = await requireSession();
  const files = formData.getAll("files") as File[];
  const incoming = await Promise.all(
    files
      .filter((f) => f && f.size > 0)
      .map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        mimeType: f.type || "application/octet-stream",
        originalFileName: f.name,
      })),
  );

  const [app] = await db
    .select({ brokerId: applications.brokerId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  const brokerId = app?.brokerId ?? session.id;

  // Se pratica senza titolare, assegna chi sta caricando
  if (app && !app.brokerId) {
    await db
      .update(applications)
      .set({ brokerId: session.id, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));
  }

  try {
    const result = await processIncomingFiles(incoming, {
      applicationId,
      brokerId,
    });
    if (result.errors.length > 0) {
      await setApplicationPipelineError(
        applicationId,
        result.errors.slice(0, 3).join("; "),
      );
    } else {
      await setApplicationPipelineError(applicationId, null);
    }
    revalidatePath(`/dashboard/applications/${applicationId}`);
    revalidatePath("/dashboard");
    return {
      ok: true as const,
      count: result.processed,
      errors: result.errors,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Upload o analisi fallita";
    await setApplicationPipelineError(applicationId, msg);
    revalidatePath(`/dashboard/applications/${applicationId}`);
    return { error: msg };
  }
}

export async function getSollecitoTextAction(applicationId: string) {
  await requireSession();
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, applicationId));

  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  const checklist = evaluateChecklist(app.requiredDocumentTypes, docs);
  const text = buildSollecitoMessage({
    clientName: app.clientName,
    brokerName: settings?.brokerName ?? "Broker",
    checklist,
  });

  return { text };
}

export async function updateRequiredDocumentsAction(
  applicationId: string,
  requiredDocumentTypes: DocumentType[],
) {
  await requireSession();
  const cleaned = [
    ...new Set(
      requiredDocumentTypes.filter(
        (t): t is DocumentType => Boolean(t) && t !== "SCONOSCIUTO",
      ),
    ),
  ];

  await db
    .update(applications)
    .set({
      requiredDocumentTypes: cleaned,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  await refreshApplicationState(applicationId);
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true, requiredDocumentTypes: cleaned };
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const secretaryEmail = String(formData.get("secretaryEmail") ?? "").trim();
  const brokerName = String(formData.get("brokerName") ?? "").trim();
  const autoSendToSecretary = formData.get("autoSendToSecretary") === "on";
  const shareRaw = String(formData.get("collaboratorSharePercent") ?? "35").trim();
  let collaboratorSharePercent = Number(shareRaw.replace(",", "."));
  if (!Number.isFinite(collaboratorSharePercent)) collaboratorSharePercent = 35;
  // Accetta 35 oppure 0.35
  if (collaboratorSharePercent > 1) collaboratorSharePercent /= 100;
  collaboratorSharePercent = Math.min(1, Math.max(0, collaboratorSharePercent));

  const provenanceRaw = String(formData.get("provenanceOptions") ?? "");
  const provenanceOptions = [
    ...new Set(
      provenanceRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({
        secretaryEmail,
        brokerName,
        autoSendToSecretary,
        collaboratorSharePercent,
        provenanceOptions,
      })
      .where(eq(systemSettings.id, "global"));
  } else {
    await db.insert(systemSettings).values({
      id: "global",
      secretaryEmail,
      brokerName,
      autoSendToSecretary,
      collaboratorSharePercent,
      provenanceOptions,
    });
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/rogitate");
}

function parseOptionalEuro(raw: FormDataEntryValue | null): number | null {
  return parseEuroExpression(raw);
}

function parseOptionalBrokerShare(raw: FormDataEntryValue | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim().replace("%", "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 1 ? Math.min(1, n / 100) : Math.min(1, n);
}

export async function updatePracticeEconomicsAction(
  applicationId: string,
  formData: FormData,
) {
  const session = await requireSession();
  const [app] = await db
    .select({
      id: applications.id,
      brokerId: applications.brokerId,
      isTest: applications.isTest,
      status: applications.status,
      rogitoAt: applications.rogitoAt,
      clientEmail: applications.clientEmail,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) return { error: "Pratica non trovata" };
  if (app.isTest && session.role !== "ADMIN") return { error: "Forbidden" };
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return { error: "Forbidden" };
  }

  const rogitoRaw = String(formData.get("rogitoAt") ?? "").trim();
  let rogitoAt: Date | null = null;
  if (rogitoRaw) {
    const d = new Date(rogitoRaw);
    if (!Number.isNaN(d.getTime())) rogitoAt = d;
  } else if (app.status === "ROGITATA" && app.rogitoAt) {
    rogitoAt = app.rogitoAt;
  }

  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientEmailRaw = String(formData.get("clientEmail") ?? "")
    .trim()
    .toLowerCase();
  if (clientEmailRaw && !clientEmailRaw.includes("@")) {
    return { error: "Email cliente non valida" };
  }
  // Vuoto = lascia placeholder tecnico (email non obbligatoria in elenco)
  const clientEmail = clientEmailRaw.includes("@")
    ? clientEmailRaw
    : app.clientEmail?.endsWith("@prontopratica.local")
      ? app.clientEmail
      : `cartella.${app.id.replace(/-/g, "").slice(0, 12)}@prontopratica.local`;

  await db
    .update(applications)
    .set({
      ...(clientName ? { clientName } : {}),
      clientEmail,
      provenance: String(formData.get("provenance") ?? "").trim() || null,
      bankName: String(formData.get("bankName") ?? "").trim() || null,
      operationType: String(formData.get("operationType") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      loanAmount: parseOptionalEuro(formData.get("loanAmount")),
      propertyAmount: parseOptionalEuro(formData.get("propertyAmount")),
      ltvPercent: parseOptionalEuro(formData.get("ltvPercent")),
      notaryName: String(formData.get("notaryName") ?? "").trim() || null,
      appraiserName: String(formData.get("appraiserName") ?? "").trim() || null,
      commissionClient: parseOptionalEuro(formData.get("commissionClient")),
      commissionBank: parseOptionalEuro(formData.get("commissionBank")),
      commissionPolicy: parseOptionalEuro(formData.get("commissionPolicy")),
      commissionCqs: parseOptionalEuro(formData.get("commissionCqs")),
      commissionLoans: parseOptionalEuro(formData.get("commissionLoans")),
      commissionNotary: parseOptionalEuro(formData.get("commissionNotary")),
      brokerSharePercent: parseOptionalBrokerShare(
        formData.get("brokerSharePercent"),
      ),
      rogitoAt,
      auditPrivacy: formData.get("auditPrivacy") === "on",
      auditContractSigned: formData.get("auditContractSigned") === "on",
      auditInstituteSheet: formData.get("auditInstituteSheet") === "on",
      auditDdmBank: formData.get("auditDdmBank") === "on",
      auditOriginalsVerified: formData.get("auditOriginalsVerified") === "on",
      auditArchive: formData.get("auditArchive") === "on",
      economicNotes: String(formData.get("economicNotes") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rogitate");
  return { ok: true };
}

/**
 * Pratica chiusa (ROGITATA): tieni i file scelti, cancella gli altri da storage.
 * Metadati / extracted restano; filePurged = true sui rimossi.
 */
export async function cleanupClosedPracticeAction(params: {
  applicationId: string;
  keepDocumentIds: string[];
  keepRelazione: boolean;
}) {
  const session = await requireSession();
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, params.applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" };
  if (app.isTest && session.role !== "ADMIN") {
    return { error: "Forbidden" };
  }
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return { error: "Forbidden" };
  }
  if (app.status !== "ROGITATA") {
    return { error: "Disponibile solo a pratica rogitata" };
  }

  const keepIds = [...new Set(params.keepDocumentIds.filter(Boolean))];
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, params.applicationId));

  let purged = 0;
  let kept = 0;

  if (keepIds.length > 0) {
    await db
      .update(documents)
      .set({ keptForHistory: true })
      .where(
        and(
          eq(documents.applicationId, params.applicationId),
          inArray(documents.id, keepIds),
        ),
      );
    kept += keepIds.length;
  }

  const toPurge = docs.filter(
    (d) =>
      !keepIds.includes(d.id) &&
      !d.filePurged &&
      d.driveFileId &&
      isSiteStorageKey(d.driveFileId),
  );

  for (const doc of toPurge) {
    try {
      if (doc.driveFileId) await deleteBlobByPathname(doc.driveFileId);
    } catch (err) {
      console.error("cleanup purge blob", doc.id, err);
    }
    await db
      .update(documents)
      .set({
        driveFileId: null,
        driveFileUrl: null,
        filePurged: true,
        keptForHistory: false,
      })
      .where(eq(documents.id, doc.id));
    purged += 1;
  }

  // Documenti già senza file: segna purged se non tenuti
  if (keepIds.length > 0) {
    await db
      .update(documents)
      .set({ keptForHistory: false })
      .where(
        and(
          eq(documents.applicationId, params.applicationId),
          notInArray(documents.id, keepIds),
        ),
      );
  } else {
    await db
      .update(documents)
      .set({ keptForHistory: false })
      .where(eq(documents.applicationId, params.applicationId));
  }

  if (!params.keepRelazione && app.relazioneStorageKey) {
    try {
      await deleteBlobByPathname(app.relazioneStorageKey);
    } catch (err) {
      console.error("cleanup relazione", err);
    }
    await db
      .update(applications)
      .set({
        relazioneStorageKey: null,
        relazioneFileName: null,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, params.applicationId));
    purged += 1;
  } else if (params.keepRelazione && app.relazioneStorageKey) {
    kept += 1;
  }

  await db
    .update(applications)
    .set({ updatedAt: new Date() })
    .where(eq(applications.id, params.applicationId));

  revalidatePath(`/dashboard/applications/${params.applicationId}`);
  revalidatePath(`/dashboard/files/${params.applicationId}`);
  revalidatePath("/dashboard");
  return { ok: true as const, purged, kept };
}

/** Modifica in-place del tipo pratica Singola <-> Coppia con aggiunta/rimozione richiedente 2 */
export async function updatePracticeTypeAction(
  applicationId: string,
  params: {
    isCouple: boolean;
    clientName?: string | null;
    clientFiscalCode?: string | null;
    coApplicantName?: string | null;
    coApplicantFiscalCode?: string | null;
  },
) {
  const session = await requireSession();
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) return { error: "Pratica non trovata" };
  if (app.isTest && session.role !== "ADMIN") return { error: "Forbidden" };
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return { error: "Forbidden" };
  }

  const patch: Record<string, unknown> = {
    isCouple: params.isCouple,
    updatedAt: new Date(),
  };

  if (params.clientName != null) {
    patch.clientName = params.clientName.trim();
  }
  if (params.clientFiscalCode !== undefined) {
    patch.clientFiscalCode =
      params.clientFiscalCode?.trim().toUpperCase() || null;
  }

  if (params.isCouple) {
    patch.coApplicantName = params.coApplicantName?.trim() || null;
    patch.coApplicantFiscalCode =
      params.coApplicantFiscalCode?.trim().toUpperCase() || null;

    const cf1 =
      (patch.clientFiscalCode as string | null | undefined) ??
      app.clientFiscalCode;
    const cf2 = patch.coApplicantFiscalCode as string | null;
    patch.applicantFiscalCodes = [cf1, cf2].filter(
      (x): x is string => Boolean(x),
    );

    const effectiveClientName =
      (patch.clientName as string | undefined) ?? app.clientName;
    const effectiveCoApplicantName =
      (patch.coApplicantName as string | null | undefined) ??
      app.coApplicantName;

    // Genera cartelle personali distinte per Richiedente 1 e 2
    const coupleDefaults = defaultStorageFolders(
      effectiveClientName,
      true,
      effectiveCoApplicantName,
    );
    const f1 = coupleDefaults[0];
    const f2 = coupleDefaults[1];

    const currentFolders = app.storageFolders?.length
      ? [...app.storageFolders]
      : [...coupleDefaults];

    // Verifica se la cartella per il secondo richiedente è presente
    const hasF2 = currentFolders.some(
      (f) =>
        f.trim().toUpperCase() === f2.trim().toUpperCase() ||
        /richiedente\s*2/i.test(f),
    );

    if (!hasF2) {
      // Inserisce f2 subito dopo la cartella del richiedente 1 senza cancellare o alterare i documenti esistenti
      const idx1 = currentFolders.findIndex(
        (f) =>
          f.trim().toUpperCase() === f1.trim().toUpperCase() ||
          /DOC$/i.test(f) ||
          /richiedente\s*1/i.test(f),
      );
      if (idx1 >= 0) {
        currentFolders.splice(idx1 + 1, 0, f2);
      } else {
        currentFolders.unshift(f2);
      }
    }

    // Assicura anche la presenza di IMMOBILE se mancante
    if (
      !currentFolders.some(
        (f) => f.toUpperCase() === "IMMOBILE" || /immobile/i.test(f),
      )
    ) {
      currentFolders.push("IMMOBILE");
    }

    patch.storageFolders = currentFolders;
  } else {
    // Ritorno a Singola: azzera i dati del secondo richiedente
    patch.coApplicantName = null;
    patch.coApplicantFiscalCode = null;
    const cf1 =
      (patch.clientFiscalCode as string | null | undefined) ??
      app.clientFiscalCode;
    patch.applicantFiscalCodes = cf1 ? [cf1] : [];
  }

  await db
    .update(applications)
    .set(patch)
    .where(eq(applications.id, applicationId));

  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath(`/dashboard/files/${applicationId}`);
  revalidatePath("/dashboard/files");
  revalidatePath("/dashboard");

  return { ok: true as const, isCouple: params.isCouple };
}
