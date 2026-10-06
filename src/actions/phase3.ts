"use server";

import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  agencyResources,
  applications,
  bankPolicies,
  systemSettings,
  users,
  type BankPolicyRow,
  type PreventivoData,
  type ResourceCategory,
} from "@/db/schema";
import { requireAdmin, requireSession } from "@/lib/auth";
import {
  ensureBankPolicySeed,
  syncBankPoliciesFromSeed,
} from "@/lib/banks/ensure-seed";
import { parseEuroExpression } from "@/lib/economics";
import { buildPreventivoPdf } from "@/lib/pdf/relazione";
import {
  deleteBlobByPathname,
  uploadAgencyResourceFile,
  uploadPreventivoFile,
} from "@/lib/storage/blob";
import { isSiteStorageKey } from "@/lib/storage/paths";

async function assertCanAccessApp(applicationId: string) {
  const session = await requireSession();
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) return { error: "Pratica non trovata" as const, session, app: null };
  if (session.role !== "ADMIN" && app.brokerId !== session.id) {
    return { error: "Forbidden" as const, session, app: null };
  }
  return { session, app, error: null };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

//     Risorse    

export async function uploadResourceAction(formData: FormData) {
  const session = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "ALTRO").trim() as ResourceCategory;
  const file = formData.get("file") as File | null;
  if (!title) return { error: "Titolo obbligatorio" };
  if (!file || file.size === 0) return { error: "Seleziona un file" };

  const allowed: ResourceCategory[] = [
    "MODULISTICA",
    "TEMPLATE",
    "POLICY",
    "PORTALI",
    "ALTRO",
  ];
  if (!allowed.includes(category)) return { error: "Categoria non valida" };

  const id = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploaded = await uploadAgencyResourceFile({
    resourceId: id,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    buffer,
  });

  await db.insert(agencyResources).values({
    id,
    title,
    category,
    fileName: file.name,
    storageKey: uploaded.pathname,
    mimeType: file.type || null,
    uploadedByUserId: session.id,
  });

  revalidatePath("/dashboard/risorse");
  return { ok: true };
}

export async function deleteResourceAction(id: string) {
  await requireAdmin();
  const [row] = await db
    .select()
    .from(agencyResources)
    .where(eq(agencyResources.id, id))
    .limit(1);
  if (!row) return { error: "Risorsa non trovata" };
  try {
    await deleteBlobByPathname(row.storageKey);
  } catch (err) {
    console.error("delete resource blob", err);
  }
  await db.delete(agencyResources).where(eq(agencyResources.id, id));
  revalidatePath("/dashboard/risorse");
  return { ok: true };
}

/** Scarica i file catalogati da Drive ufficio e li mette in Risorse (R2). */
export async function syncResourcesFromDriveAction() {
  const session = await requireAdmin();
  const { listConnectedGoogleUsers, oauthClientFromRefreshToken } =
    await import("@/lib/google/auth");
  const { downloadFileFromDrive } = await import("@/lib/google/drive");
  const { RESOURCE_DRIVE_SEEDS } = await import(
    "@/lib/resources/drive-catalog"
  );

  const connected = await listConnectedGoogleUsers();
  if (!connected[0]?.googleRefreshToken) {
    return {
      error:
        "Google ufficio non collegato. Impostazioni → Collega Google, poi riprova.",
    };
  }
  const auth = oauthClientFromRefreshToken(connected[0].googleRefreshToken);

  const existing = await db.select().from(agencyResources);
  const byTitle = new Map(
    existing.map((r) => [r.title.trim().toLowerCase(), r]),
  );

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const seed of RESOURCE_DRIVE_SEEDS) {
    const key = seed.title.trim().toLowerCase();
    if (byTitle.has(key)) {
      skipped += 1;
      continue;
    }
    try {
      const file = await downloadFileFromDrive(seed.driveFileId, auth);
      const id = randomUUID();
      const uploaded = await uploadAgencyResourceFile({
        resourceId: id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });
      await db.insert(agencyResources).values({
        id,
        title: seed.title,
        category: seed.category,
        fileName: file.fileName,
        storageKey: uploaded.pathname,
        mimeType: file.mimeType,
        uploadedByUserId: session.id,
      });
      inserted += 1;
    } catch (err) {
      failed += 1;
      errors.push(
        `${seed.title}: ${err instanceof Error ? err.message : "errore"}`,
      );
    }
  }

  revalidatePath("/dashboard/risorse");
  return { ok: true as const, inserted, skipped, failed, errors };
}

//     Banche    

export async function listBankPoliciesAction() {
  await requireSession();
  await ensureBankPolicySeed();
  return db.select().from(bankPolicies).orderBy(asc(bankPolicies.sortOrder));
}

export async function upsertBankPolicyAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim() || null;
  const bankName = String(formData.get("bankName") ?? "").trim();
  if (!bankName) return { error: "Nome banca obbligatorio" };

  const summary = String(formData.get("summary") ?? "").trim() || null;
  const detailText = String(formData.get("detailText") ?? "").trim() || null;
  const rowsRaw = String(formData.get("rowsJson") ?? "[]");
  let rows: BankPolicyRow[] = [];
  try {
    const parsed = JSON.parse(rowsRaw) as BankPolicyRow[];
    rows = Array.isArray(parsed)
      ? parsed
          .filter((x) => x && typeof x.label === "string")
          .map((x) => ({
            label: String(x.label).trim(),
            value: String(x.value ?? "").trim(),
          }))
          .filter((x) => x.label)
      : [];
  } catch {
    return { error: "Righe policy non valide (JSON)" };
  }

  const sortOrder = Number(formData.get("sortOrder") ?? 0) || 0;
  const slug = slugify(bankName) || `banca-${Date.now()}`;

  if (id) {
    await db
      .update(bankPolicies)
      .set({
        bankName,
        slug,
        summary,
        rows,
        detailText,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(bankPolicies.id, id));
  } else {
    await db.insert(bankPolicies).values({
      bankName,
      slug,
      summary,
      rows,
      detailText,
      sortOrder,
    });
  }

  revalidatePath("/dashboard/banche");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteBankPolicyAction(id: string) {
  await requireAdmin();
  await db.delete(bankPolicies).where(eq(bankPolicies.id, id));
  revalidatePath("/dashboard/banche");
  return { ok: true as const };
}

/** Sincronizza scheda banche dal seed completo (upsert per slug). */
export async function reseedBankPoliciesAction() {
  await requireAdmin();
  const { inserted, updated } = await syncBankPoliciesFromSeed();
  revalidatePath("/dashboard/banche");
  revalidatePath("/dashboard");
  return { ok: true as const, inserted, updated };
}

// Preventivo

function preventivoFromForm(formData: FormData, app: typeof applications.$inferSelect): PreventivoData {
  return {
    propertyAmount:
      parseEuroExpression(formData.get("propertyAmount")) ??
      app.propertyAmount,
    loanAmount:
      parseEuroExpression(formData.get("loanAmount")) ?? app.loanAmount,
    durationYears: (() => {
      const n = Number(String(formData.get("durationYears") ?? "").replace(",", "."));
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    monthlyInstallment: parseEuroExpression(formData.get("monthlyInstallment")),
    ratePercent: (() => {
      const n = Number(String(formData.get("ratePercent") ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    })(),
    rateNote: String(formData.get("rateNote") ?? "").trim() || null,
    bankName:
      String(formData.get("bankName") ?? "").trim() || app.bankName || null,
    productNote: String(formData.get("productNote") ?? "").trim() || null,
    feeIstruttoria: parseEuroExpression(formData.get("feeIstruttoria")),
    feeImposta: parseEuroExpression(formData.get("feeImposta")),
    feeMediazione: parseEuroExpression(formData.get("feeMediazione")),
    feeOther: parseEuroExpression(formData.get("feeOther")),
    feeOtherLabel: String(formData.get("feeOtherLabel") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function generatePreventivoAction(
  applicationId: string,
  formData: FormData,
) {
  const access = await assertCanAccessApp(applicationId);
  if (access.error || !access.app) return { error: access.error ?? "Errore" };

  const data = preventivoFromForm(formData, access.app);

  const [settings] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  let brokerName = settings?.brokerName ?? "Broker";
  let brokerEmail: string | null = null;
  if (access.app.brokerId) {
    const [b] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, access.app.brokerId))
      .limit(1);
    if (b?.name) brokerName = b.name;
    if (b?.email) brokerEmail = b.email;
  }

  const buffer = await buildPreventivoPdf({
    clientName: access.app.clientName,
    brokerName,
    brokerEmail,
    ...data,
  });

  if (
    access.app.preventivoStorageKey &&
    isSiteStorageKey(access.app.preventivoStorageKey)
  ) {
    try {
      await deleteBlobByPathname(access.app.preventivoStorageKey);
    } catch {
      // ignore
    }
  }

  const uploaded = await uploadPreventivoFile({
    applicationId,
    clientName: access.app.clientName,
    buffer,
  });

  await db
    .update(applications)
    .set({
      preventivoData: data,
      preventivoStorageKey: uploaded.pathname,
      preventivoFileName: uploaded.pathname.split("/").pop() ?? "preventivo.pdf",
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  revalidatePath(`/dashboard/applications/${applicationId}`);
  return { ok: true };
}
