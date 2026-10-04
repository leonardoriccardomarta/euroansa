import { neon } from "@neondatabase/serverless";
import { SETUP_STATEMENTS } from "@/lib/db/setup-statements";

const globalEnsure = globalThis as unknown as {
  __euroansaSchemaReady?: boolean;
  __euroansaSchemaPromise?: Promise<{ ok: boolean; error?: string }>;
};

/**
 * Applica ALTER/CREATE idempotenti una volta per cold start.
 * Evita crash post-deploy per colonne mancanti.
 */
export async function ensureSchema(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (globalEnsure.__euroansaSchemaReady) {
    return { ok: true };
  }
  if (globalEnsure.__euroansaSchemaPromise) {
    return globalEnsure.__euroansaSchemaPromise;
  }

  globalEnsure.__euroansaSchemaPromise = (async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return { ok: false, error: "DATABASE_URL mancante" };
    }
    try {
      const sql = neon(databaseUrl);
      for (const statement of SETUP_STATEMENTS) {
        await sql.query(statement);
      }
      globalEnsure.__euroansaSchemaReady = true;
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("ensureSchema failed", message);
      return { ok: false, error: message };
    }
  })();

  return globalEnsure.__euroansaSchemaPromise;
}

export function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("does not exist") ||
    (msg.includes("column") && msg.includes("undefined")) ||
    /relation .* does not exist/i.test(msg)
  );
}
