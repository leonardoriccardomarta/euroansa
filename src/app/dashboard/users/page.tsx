import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createUserAction, deleteUserAction } from "@/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");

  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Utenti broker</h1>
        <p className="mt-2 text-slate-600">
          Crea accessi email/password per i collaboratori
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nuovo utente
        </p>
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="font-semibold">
              Nome
            </Label>
            <Input id="name" name="name" required className="h-10 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-semibold">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              className="h-10 rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="font-semibold">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className="h-10 rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role" className="font-semibold">
              Ruolo
            </Label>
            <select
              id="role"
              name="role"
              className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              defaultValue="BROKER"
            >
              <option value="BROKER">Broker</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              className="h-10 rounded-lg bg-primary-600 font-semibold shadow-md hover:bg-primary-700"
            >
              Crea utente
            </Button>
          </div>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-slate-900">Elenco utenti</h2>
        {allUsers.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div>
              <p className="font-semibold text-slate-900">{u.name}</p>
              <p className="text-sm text-slate-500">
                {u.email} · {u.role}
              </p>
            </div>
            {u.id !== session.id && (
              <form action={deleteUserAction}>
                <input type="hidden" name="userId" value={u.id} />
                <Button type="submit" variant="outline" size="sm">
                  Elimina
                </Button>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
