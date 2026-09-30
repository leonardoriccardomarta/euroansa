-- Initial schema Euroansa
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'BROKER');
CREATE TYPE "public"."employment_type" AS ENUM('DIPENDENTE_INDETERMINATO', 'PARTITA_IVA', 'PENSIONATO', 'ALTRO');
CREATE TYPE "public"."application_status" AS ENUM('IN_ATTESA_DOCUMENTI', 'DOCUMENTI_INCOMPLETI', 'COMPLETA_DA_INOLTRARE', 'INVIATA_A_SEGRETERIA', 'ANOMALIA', 'INVIATA_IN_BANCA', 'PERITO_NOMINATO', 'DELIBERATA');
CREATE TYPE "public"."document_type" AS ENUM('CARTA_IDENTITA', 'TESSERA_SANITARIA', 'BUSTA_PAGA_1', 'BUSTA_PAGA_2', 'BUSTA_PAGA_3', 'CUD_730', 'ATTO_IMMOBILE', 'CEDOLINO_PENSIONE', 'MODELLO_UNICO', 'F24', 'VISURA_CAMERALE', 'SCONOSCIUTO');

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'BROKER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"client_email" varchar(255) NOT NULL,
	"client_fiscal_code" varchar(16),
	"employment_type" "employment_type" DEFAULT 'DIPENDENTE_INDETERMINATO' NOT NULL,
	"status" "application_status" DEFAULT 'IN_ATTESA_DOCUMENTI' NOT NULL,
	"drive_folder_id" text,
	"drive_folder_url" text,
	"pre_scoring_data" jsonb,
	"broker_id" uuid,
	"sent_to_secretary_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"raw_file_name" text NOT NULL,
	"renamed_file_name" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"drive_file_id" text,
	"drive_file_url" text,
	"is_valid" boolean DEFAULT false NOT NULL,
	"extracted_data" jsonb,
	"validation_issues" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "system_settings" (
	"id" varchar(50) PRIMARY KEY DEFAULT 'global' NOT NULL,
	"secretary_email" varchar(255) NOT NULL,
	"broker_name" varchar(255) NOT NULL,
	"auto_send_to_secretary" boolean DEFAULT true NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
