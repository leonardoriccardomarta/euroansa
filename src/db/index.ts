import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = NeonHttpDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __euroansaDb?: Db };

function createDb(): Db {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL non configurata. Imposta la connection string Neon in .env.local",
    );
  }
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export const db: Db =
  globalForDb.__euroansaDb ??
  new Proxy({} as Db, {
    get(_target, prop, receiver) {
      const instance = (globalForDb.__euroansaDb ??= createDb());
      return Reflect.get(instance, prop, receiver);
    },
  });
