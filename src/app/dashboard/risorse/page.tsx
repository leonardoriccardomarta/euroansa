import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { agencyResources } from "@/db/schema";
import { ResourcesClient } from "@/components/dashboard/resources-client";

export const dynamic = "force-dynamic";

export default async function RisorsePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await db
    .select()
    .from(agencyResources)
    .orderBy(desc(agencyResources.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Risorse</h1>
        <p className="mt-2 text-slate-600">
          Modulistica, template, policy e documenti ufficio. Admin: sync da Drive
          e import pratiche chiuse 2026 (economia + broker).
        </p>
      </div>
      <ResourcesClient
        rows={rows}
        isAdmin={session.role === "ADMIN"}
      />
    </div>
  );
}
