import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { SETUP_STATEMENTS } from "@/lib/db/setup-statements";

export const maxDuration = 60;

/**
 * Setup one-shot in produzione (niente comandi locali).
 * POST /api/setup
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
  }

  try {
    const sql = neon(databaseUrl);

    for (const statement of SETUP_STATEMENTS) {
      await sql.query(statement);
    }

    const email = (process.env.ADMIN_EMAIL ?? "admin@euroansa.local").toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "admin123456";
    const passwordHash = await bcrypt.hash(password, 10);
    const secretary =
      process.env.SECRETARY_EMAIL_DEFAULT ?? "segreteria@example.com";

    await sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES (${email}, ${passwordHash}, ${"Euroansa"}, ${"ADMIN"}::user_role)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = ${"ADMIN"}::user_role,
        name = COALESCE(NULLIF(users.name, ''), EXCLUDED.name)
    `;

    await sql`
      UPDATE users
      SET role = ${"BROKER"}::user_role
      WHERE role = ${"ADMIN"}::user_role
        AND lower(email) <> ${email}
    `;

    await sql`
      INSERT INTO system_settings (id, secretary_email, broker_name, auto_send_to_secretary)
      VALUES (${"global"}, ${secretary}, ${"Euroansa"}, ${true})
      ON CONFLICT (id) DO NOTHING
    `;

    return NextResponse.json({
      ok: true,
      message: "Schema applicato, unico admin org e settings pronti",
      adminEmail: email,
    });
  } catch (error) {
    console.error("setup error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Setup failed",
      },
      { status: 500 },
    );
  }
}
