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
  const admin = allUsers.find((u) => u.role === "ADMIN");
  const brokers = allUsers.filter((u) => u.role === "BROKER");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Utenti</h1>
        <p className="mt-2 text-slate-600">
          Un solo admin = org Euroansa (Gmail ufficio + storage sito). I broker servono
          per assegnazione e, se entrano, vedono solo le loro pratiche.
        </p>
      </div>

      {admin ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            Admin org (unico)
          </p>
          <p className="mt-1 font-semibold text-slate-900">{admin.name}</p>
          <p className="text-sm text-slate-600">{admin.email}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nuovo broker
        </p>
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="role" value="BROKER" />
          <div className="space-y-2">
            <Label htmlFor="name" className="font-semibold">
              Nome
            </Label>
            <Input id="name" name="name" required className="h-10 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-semibold">
              Email login
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              className="h-10 rounded-lg"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="password" className="font-semibold">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className="h-10 max-w-md rounded-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              className="h-10 rounded-lg bg-primary-600 font-semibold shadow-md hover:bg-primary-700"
            >
              Crea broker
            </Button>
          </div>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-slate-900">Broker</h2>
        {brokers.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nessun broker. Creane uno per poterlo scegliere in assegnazione.
          </p>
        ) : (
          brokers.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div>
                <p className="font-semibold text-slate-900">{u.name}</p>
                <p className="text-sm text-slate-500">{u.email} · BROKER</p>
              </div>
              <form action={deleteUserAction}>
                <input type="hidden" name="userId" value={u.id} />
                <Button type="submit" variant="outline" size="sm">
                  Elimina
                </Button>
              </form>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
