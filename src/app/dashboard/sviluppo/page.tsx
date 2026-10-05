import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { agencyDevelopment } from "@/db/schema";
import { SviluppoClient } from "@/components/dashboard/sviluppo-client";

export const dynamic = "force-dynamic";

export default async function SviluppoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const where =
    session.role === "ADMIN"
      ? undefined
      : eq(agencyDevelopment.brokerId, session.id);

  const rows = await (where
    ? db.select().from(agencyDevelopment).where(where)
    : db.select().from(agencyDevelopment)
  ).orderBy(desc(agencyDevelopment.updatedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Sviluppo</h1>
        <p className="mt-2 text-slate-600">
          Rapporti con agenzie partner: fase contatto e consolidamento.
        </p>
      </div>
      <SviluppoClient rows={rows} />
    </div>
  );
}
