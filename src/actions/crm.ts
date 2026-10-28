"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  agencyDevelopment,
  appointments,
  applications,
  leads,
  systemSettings,
  type AgencyDevPhase,
  type BudgetTargets,
  type LeadOutcomeDb,
} from "@/db/schema";
import { requireAdmin, requireSession, type SessionUser } from "@/lib/auth";
import { parseEuroExpression } from "@/lib/economics";
import { createClientFolderAction } from "@/actions/files";

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
}

async function assertOwnBroker(
  session: SessionUser,
  brokerId: string | null | undefined,
) {
  if (session.role === "ADMIN") return false;
  return brokerId === session.id;
}

/** Leads / appuntamenti / sviluppo: solo broker. */
async function requireBroker(): Promise<SessionUser | { error: string }> {
  const session = await requireSession();
  if (session.role === "ADMIN") {
    return { error: "Sezione riservata ai broker" };
  }
  return session;
}

export async function upsertLeadAction(formData: FormData) {
  const session = await requireBroker();
  if ("error" in session) return session;
  const id = String(formData.get("id") ?? "").trim() || null;
  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!clientName) return { error: "Nome cliente obbligatorio" };

  const outcomeRaw = String(formData.get("outcome") ?? "").trim();
  const outcome = (outcomeRaw || null) as LeadOutcomeDb | null;
  const monthRaw = String(formData.get("activityMonth") ?? "").trim();
  const activityMonth = monthRaw
    ? monthStart(new Date(`${monthRaw}-01T12:00:00`))
    : monthStart(new Date());

  const values = {
    clientName,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    provenance: String(formData.get("provenance") ?? "").trim() || null,
    outcome,
    notes: String(formData.get("notes") ?? "").trim() || null,
    activityMonth,
    brokerId: session.id,
    updatedAt: new Date(),
  };

  if (id) {
    const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (!row) return { error: "Lead non trovato" };
    if (!(await assertOwnBroker(session, row.brokerId))) {
      return { error: "Forbidden" };
    }
    await db.update(leads).set(values).where(eq(leads.id, id));
  } else {
    await db.insert(leads).values(values);
  }

  revalidatePath("/dashboard/leads");
  return { ok: true };
}

export async function deleteLeadAction(id: string) {
  const session = await requireBroker();
  if ("error" in session) return session;
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!row) return { error: "Lead non trovato" };
  if (!(await assertOwnBroker(session, row.brokerId))) return { error: "Forbidden" };
  await db.delete(leads).where(eq(leads.id, id));
  revalidatePath("/dashboard/leads");
  return { ok: true };
}

export async function upsertAppointmentAction(formData: FormData) {
  const session = await requireBroker();
  if ("error" in session) return session;
  const id = String(formData.get("id") ?? "").trim() || null;
  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!clientName) return { error: "Nome cliente obbligatorio" };

  const dateRaw = String(formData.get("appointmentAt") ?? "").trim();
  const appointmentAt = dateRaw ? new Date(dateRaw) : new Date();
  if (Number.isNaN(appointmentAt.getTime())) {
    return { error: "Data appuntamento non valida" };
  }

  const leadId = String(formData.get("leadId") ?? "").trim() || null;

  const values = {
    clientName,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    provenance: String(formData.get("provenance") ?? "").trim() || null,
    operationType: String(formData.get("operationType") ?? "").trim() || null,
    amount: parseEuroExpression(formData.get("amount")),
    propertyAmount: parseEuroExpression(formData.get("propertyAmount")),
    notes: String(formData.get("notes") ?? "").trim() || null,
    hasMandate: formData.get("hasMandate") === "on",
    appointmentAt,
    leadId,
    brokerId: session.id,
    updatedAt: new Date(),
  };

  if (id) {
    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);
    if (!row) return { error: "Appuntamento non trovato" };
    if (!(await assertOwnBroker(session, row.brokerId))) {
      return { error: "Forbidden" };
    }
    await db.update(appointments).set(values).where(eq(appointments.id, id));
  } else {
    await db.insert(appointments).values(values);
  }

  revalidatePath("/dashboard/appointments");
  revalidatePath("/dashboard/leads");
  return { ok: true };
}

export async function deleteAppointmentAction(id: string) {
  const session = await requireBroker();
  if ("error" in session) return session;
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);
  if (!row) return { error: "Appuntamento non trovato" };
  if (!(await assertOwnBroker(session, row.brokerId))) return { error: "Forbidden" };
  await db.delete(appointments).where(eq(appointments.id, id));
  revalidatePath("/dashboard/appointments");
  return { ok: true };
}

export type CreatePracticeOptions = {
  clientName?: string;
  clientFiscalCode?: string | null;
  isCouple?: boolean;
  coApplicantName?: string | null;
  coApplicantFiscalCode?: string | null;
};

export async function createPracticeFromAppointmentAction(
  appointmentId: string,
  options?: CreatePracticeOptions,
) {
  const session = await requireBroker();
  if ("error" in session) return session;
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!row) return { error: "Appuntamento non trovato" };
  if (!(await assertOwnBroker(session, row.brokerId))) return { error: "Forbidden" };

  if (row.applicationId) {
    return { ok: true as const, applicationId: row.applicationId };
  }

  const created = await createClientFolderAction({
    clientName: options?.clientName?.trim() || row.clientName,
    clientFiscalCode: options?.clientFiscalCode?.trim() || null,
    isCouple: options?.isCouple ?? false,
    coApplicantName: options?.coApplicantName?.trim() || null,
    coApplicantFiscalCode: options?.coApplicantFiscalCode?.trim() || null,
  });
  if (created && "error" in created && created.error) {
    return { error: created.error };
  }
  if (!created || !("applicationId" in created) || !created.applicationId) {
    return { error: "Creazione pratica fallita" };
  }
  const applicationId = created.applicationId;

  await db
    .update(appointments)
    .set({ applicationId, updatedAt: new Date() })
    .where(eq(appointments.id, appointmentId));

  const clientEmail = row.email?.trim().toLowerCase() || null;
  await db
    .update(applications)
    .set({
      phone: row.phone,
      provenance: row.provenance,
      operationType: row.operationType,
      loanAmount: row.amount,
      propertyAmount: row.propertyAmount,
      brokerId: row.brokerId ?? session.id,
      ...(clientEmail && !clientEmail.endsWith("@prontopratica.local")
        ? { clientEmail }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  revalidatePath("/dashboard/appointments");
  revalidatePath("/dashboard");
  return { ok: true as const, applicationId };
}

export async function upsertAgencyDevAction(formData: FormData) {
  const session = await requireBroker();
  if ("error" in session) return session;
  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nome agenzia obbligatorio" };

  const phase = (String(formData.get("phase") ?? "CONTATTO") ||
    "CONTATTO") as AgencyDevPhase;

  const num = (k: string) => parseEuroExpression(formData.get(k)) ?? 0;

  const values = {
    name,
    typology: String(formData.get("typology") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    ownerName: String(formData.get("ownerName") ?? "").trim() || null,
    phase,
    week1: num("week1"),
    week2: num("week2"),
    week3: num("week3"),
    week4: num("week4"),
    clientDone: num("clientDone"),
    visitCount: num("visitCount"),
    appointmentCount: num("appointmentCount"),
    collaboration: num("collaboration"),
    appCount: num("appCount"),
    notes: String(formData.get("notes") ?? "").trim() || null,
    brokerId: session.id,
    updatedAt: new Date(),
  };

  if (id) {
    const [row] = await db
      .select()
      .from(agencyDevelopment)
      .where(eq(agencyDevelopment.id, id))
      .limit(1);
    if (!row) return { error: "Record non trovato" };
    if (!(await assertOwnBroker(session, row.brokerId))) {
      return { error: "Forbidden" };
    }
    await db
      .update(agencyDevelopment)
      .set(values)
      .where(eq(agencyDevelopment.id, id));
  } else {
    await db.insert(agencyDevelopment).values(values);
  }

  revalidatePath("/dashboard/sviluppo");
  return { ok: true };
}

export async function deleteAgencyDevAction(id: string) {
  const session = await requireBroker();
  if ("error" in session) return session;
  const [row] = await db
    .select()
    .from(agencyDevelopment)
    .where(eq(agencyDevelopment.id, id))
    .limit(1);
  if (!row) return { error: "Record non trovato" };
  if (!(await assertOwnBroker(session, row.brokerId))) return { error: "Forbidden" };
  await db.delete(agencyDevelopment).where(eq(agencyDevelopment.id, id));
  revalidatePath("/dashboard/sviluppo");
  return { ok: true };
}

export async function updateBudgetTargetsAction(formData: FormData) {
  await requireAdmin();

  const product = (key: keyof BudgetTargets): BudgetTargets[typeof key] => ({
    erogato: parseEuroExpression(formData.get(`${key}Erogato`)) ?? 0,
    pezzi: parseEuroExpression(formData.get(`${key}Pezzi`)) ?? 0,
    rate: parseEuroExpression(formData.get(`${key}Rate`)) ?? 0,
  });

  const budgetTargets: BudgetTargets = {
    mutui: product("mutui"),
    cqs: product("cqs"),
    polizze: product("polizze"),
    prestiti: product("prestiti"),
  };
  for (const k of Object.keys(budgetTargets) as (keyof BudgetTargets)[]) {
    if (budgetTargets[k].rate > 1) budgetTargets[k].rate /= 100;
  }

  const budgetYear = String(formData.get("budgetYear") ?? "2026").trim() || "2026";

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, "global"))
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({ budgetTargets, budgetYear })
      .where(eq(systemSettings.id, "global"));
  } else {
    await db.insert(systemSettings).values({
      id: "global",
      secretaryEmail:
        process.env.SECRETARY_EMAIL_DEFAULT ?? "segreteria@example.com",
      brokerName: "Broker",
      budgetTargets,
      budgetYear,
    });
  }

  revalidatePath("/dashboard/budget");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
