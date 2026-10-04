import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { SchemaBanner } from "@/components/dashboard/schema-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const schema = await ensureSchema();

  return (
    <AppShell userName={session.name} isAdmin={session.role === "ADMIN"}>
      {!schema.ok && schema.error ? (
        <SchemaBanner error={schema.error} />
      ) : null}
      {children}
    </AppShell>
  );
}
