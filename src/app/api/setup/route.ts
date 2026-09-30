import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

export const maxDuration = 60;

const SETUP_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `DO $$ BEGIN CREATE TYPE user_role AS ENUM ('ADMIN', 'BROKER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE employment_type AS ENUM ('DIPENDENTE_INDETERMINATO', 'PARTITA_IVA', 'PENSIONATO', 'ALTRO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE application_status AS ENUM ('IN_ATTESA_DOCUMENTI', 'DOCUMENTI_INCOMPLETI', 'COMPLETA_DA_INOLTRARE', 'INVIATA_A_SEGRETERIA', 'ANOMALIA', 'INVIATA_IN_BANCA', 'PERITO_NOMINATO', 'DELIBERATA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE document_type AS ENUM ('CARTA_IDENTITA', 'TESSERA_SANITARIA', 'BUSTA_PAGA_1', 'BUSTA_PAGA_2', 'BUSTA_PAGA_3', 'CUD_730', 'ATTO_IMMOBILE', 'CEDOLINO_PENSIONE', 'MODELLO_UNICO', 'F24', 'VISURA_CAMERALE', 'SCONOSCIUTO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    email varchar(255) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    name varchar(255) NOT NULL,
    role user_role DEFAULT 'BROKER' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    client_name varchar(255) NOT NULL,
    client_email varchar(255) NOT NULL,
    client_fiscal_code varchar(16),
    employment_type employment_type DEFAULT 'DIPENDENTE_INDETERMINATO' NOT NULL,
    status application_status DEFAULT 'IN_ATTESA_DOCUMENTI' NOT NULL,
    drive_folder_id text,
    drive_folder_url text,
    pre_scoring_data jsonb,
    broker_id uuid REFERENCES users(id) ON DELETE SET NULL,
    sent_to_secretary_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    raw_file_name text NOT NULL,
    renamed_file_name text NOT NULL,
    document_type document_type NOT NULL,
    drive_file_id text,
    drive_file_url text,
    is_valid boolean DEFAULT false NOT NULL,
    extracted_data jsonb,
    validation_issues text[] DEFAULT '{}' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_settings (
    id varchar(50) PRIMARY KEY DEFAULT 'global' NOT NULL,
    secretary_email varchar(255) NOT NULL,
    broker_name varchar(255) NOT NULL,
    auto_send_to_secretary boolean DEFAULT true NOT NULL
  )`,
];

/**
 * Setup one-shot in produzione (niente comandi locali).
 * POST /api/setup
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

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
      VALUES (${email}, ${passwordHash}, ${"Admin"}, ${"ADMIN"}::user_role)
      ON CONFLICT (email) DO NOTHING
    `;

    await sql`
      INSERT INTO system_settings (id, secretary_email, broker_name, auto_send_to_secretary)
      VALUES (${"global"}, ${secretary}, ${"Euroansa"}, ${true})
      ON CONFLICT (id) DO NOTHING
    `;

    return NextResponse.json({
      ok: true,
      message: "Schema applicato, admin e settings pronti",
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
