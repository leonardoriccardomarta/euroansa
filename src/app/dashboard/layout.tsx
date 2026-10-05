import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ensureSchema } from "@/lib/db/ensure-schema";
import { SchemaBanner } from "@/components/dashboard/schema-banner";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const schema = await ensureSchema();

  const [userRow] = await db
    .select({ tutorialCompletedAt: users.tutorialCompletedAt })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  return (
    <AppShell
      userName={session.name}
      isAdmin={session.role === "ADMIN"}
      tutorialDone={Boolean(userRow?.tutorialCompletedAt)}
    >
      {!schema.ok && schema.error ? (
        <SchemaBanner error={schema.error} />
      ) : null}
      {children}
    </AppShell>
  );
}
