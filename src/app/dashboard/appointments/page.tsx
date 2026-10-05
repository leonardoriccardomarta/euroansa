import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { appointments, systemSettings } from "@/db/schema";
import { AppointmentsClient } from "@/components/dashboard/appointments-client";
import { DEFAULT_PROVENANCE_OPTIONS } from "@/lib/economics";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const where =
    session.role === "ADMIN"
      ? undefined
      : eq(appointments.brokerId, session.id);

  const [rows, settings] = await Promise.all([
    (where
      ? db.select().from(appointments).where(where)
      : db.select().from(appointments)
    ).orderBy(desc(appointments.appointmentAt)),
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
        <h1 className="text-3xl font-bold text-slate-900">Appuntamenti</h1>
        <p className="mt-2 text-slate-600">
          Prime visite e consulenze. Con incarico puoi creare la pratica
          documenti.
        </p>
      </div>
      <AppointmentsClient rows={rows} provenanceOptions={provenance} />
    </div>
  );
}
