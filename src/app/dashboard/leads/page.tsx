import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { leads, systemSettings } from "@/db/schema";
import { LeadsClient } from "@/components/dashboard/leads-client";
import { DEFAULT_PROVENANCE_OPTIONS } from "@/lib/economics";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const where =
    session.role === "ADMIN" ? undefined : eq(leads.brokerId, session.id);

  const [rows, settings] = await Promise.all([
    (where
      ? db.select().from(leads).where(where)
      : db.select().from(leads)
    ).orderBy(desc(leads.updatedAt)),
    db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, "global"))
      .limit(1),
  ]);

  const provenance =
    settings[0]?.provenanceOptions?.length
      ? settings[0].provenanceOptions
      : [...DEFAULT_PROVENANCE_OPTIONS];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Leads</h1>
        <p className="mt-2 text-slate-600">
          Chiamate a freddo: esito e note. Solo i tuoi lead
          {session.role === "ADMIN" ? " (admin: tutti)" : ""}.
        </p>
      </div>
      <LeadsClient rows={rows} provenanceOptions={provenance} />
    </div>
  );
}
