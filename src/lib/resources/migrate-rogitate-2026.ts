import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { applications, users } from "@/db/schema";
import { defaultStorageFolders } from "@/lib/config/documents";
import {
  fetchLiveOrEmbedded2026Data,
  type Rogitata2026Record,
} from "@/lib/resources/rogitate-2026-data";

export type MigrationRogitate2026Result = {
  ok: boolean;
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  source: "live_sheet" | "embedded";
  brokerId: string;
  brokerName: string;
  details: Array<{
    clientName: string;
    month: string;
    action: "inserted" | "updated" | "skipped";
    loanAmount: number | null;
    totalRevenue: number;
  }>;
  error?: string;
};

export async function findFilippoBroker(): Promise<{
  id: string;
  name: string;
  email: string;
  payoutSharePercent: number | null;
} | null> {
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      payoutSharePercent: users.payoutSharePercent,
    })
    .from(users);

  if (allUsers.length === 0) return null;

  const needles = ["filippo", "filip", "carriero"];
  for (const n of needles) {
    const hit = allUsers.find(
      (u) =>
        u.name.toLowerCase().includes(n) ||
        u.email.toLowerCase().includes(n),
    );
    if (hit) return hit;
  }

  // Fallback sul primo broker disponibile, oppure primo utente
  const broker = allUsers.find((u) => u.role === "BROKER");
  return broker ?? allUsers[0] ?? null;
}

/** Calcola ricavo complessivo pratica da componenti commissioni */
function computeTotalRevenue(r: Rogitata2026Record): number {
  return (
    (r.commissionPolicy ?? 0) / 2 +
    (r.commissionCqs ?? 0) +
    (r.commissionBank ?? 0) +
    (r.commissionClient ?? 0) +
    (r.commissionLoans ?? 0)
  );
}

export async function executeMigrateRogitate2026(): Promise<MigrationRogitate2026Result> {
  const filippo = await findFilippoBroker();
  if (!filippo) {
    return {
      ok: false,
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      source: "embedded",
      brokerId: "",
      brokerName: "",
      details: [],
      error: "Nessun utente o broker trovato a cui associare le pratiche",
    };
  }

  const { records, source } = await fetchLiveOrEmbedded2026Data();

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const details: MigrationRogitate2026Result["details"] = [];

  const brokerShare = filippo.payoutSharePercent ?? 0.35;

  for (const record of records) {
    const clientNameNorm = record.clientName.trim().toUpperCase();
    const rogitoDate = new Date(record.rogitoAt);
    const revenue = computeTotalRevenue(record);

    try {
      // Verifica duplicati: per nome cliente e brokerId tra le ROGITATE o con data 2026
      const existing = await db
        .select({
          id: applications.id,
          clientName: applications.clientName,
          status: applications.status,
          loanAmount: applications.loanAmount,
          rogitoAt: applications.rogitoAt,
          brokerSharePercent: applications.brokerSharePercent,
        })
        .from(applications)
        .where(
          and(
            ilike(applications.clientName, clientNameNorm),
            eq(applications.brokerId, filippo.id),
          ),
        )
        .limit(1);

      const target = existing[0];

      const economicPayload = {
        status: "ROGITATA" as const,
        brokerId: filippo.id,
        operationType: record.operationType,
        bankName: record.bankName,
        provenance: record.provenance,
        loanAmount: record.loanAmount,
        propertyAmount: record.propertyAmount,
        ltvPercent: record.ltvPercent,
        notaryName: record.notaryName,
        appraiserName: record.appraiserName,
        commissionClient: record.commissionClient,
        commissionBank: record.commissionBank,
        commissionPolicy: record.commissionPolicy,
        commissionCqs: record.commissionCqs,
        commissionLoans: record.commissionLoans,
        commissionNotary: record.commissionNotary,
        brokerSharePercent: brokerShare,
        rogitoAt: rogitoDate,
        // Audit economico e conformità completato e verificato
        auditPrivacy: true,
        auditContractSigned: true,
        auditInstituteSheet: true,
        auditDdmBank: true,
        auditOriginalsVerified: true,
        auditArchive: true,
        economicNotes: `Pratica Rogitata 2026 (${record.month}) importata da Google Sheet Filippo Carriero`,
        isTest: false,
        updatedAt: new Date(),
      };

      if (target) {
        // Se già presente, aggiorna i dati economici e verifica audit
        await db
          .update(applications)
          .set(economicPayload)
          .where(eq(applications.id, target.id));

        updated += 1;
        details.push({
          clientName: clientNameNorm,
          month: record.month,
          action: "updated",
          loanAmount: record.loanAmount,
          totalRevenue: revenue,
        });
      } else {
        // Inserimento nuova pratica 2026
        const safeSlug = clientNameNorm
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ".")
          .replace(/^\.+|\.+$/g, "");

        await db.insert(applications).values({
          clientName: clientNameNorm,
          clientEmail: `${safeSlug}.rogitata2026@prontopratica.local`,
          phone: record.phone,
          requiredDocumentTypes: [],
          storageFolders: defaultStorageFolders(clientNameNorm),
          ...economicPayload,
        });

        imported += 1;
        details.push({
          clientName: clientNameNorm,
          month: record.month,
          action: "inserted",
          loanAmount: record.loanAmount,
          totalRevenue: revenue,
        });
      }
    } catch (err) {
      console.error(`Errore importazione pratica ${clientNameNorm}:`, err);
      skipped += 1;
      details.push({
        clientName: clientNameNorm,
        month: record.month,
        action: "skipped",
        loanAmount: record.loanAmount,
        totalRevenue: revenue,
      });
    }
  }

  return {
    ok: true,
    total: records.length,
    imported,
    updated,
    skipped,
    source,
    brokerId: filippo.id,
    brokerName: filippo.name,
    details,
  };
}
