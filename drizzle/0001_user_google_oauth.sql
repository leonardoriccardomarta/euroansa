-- Per-user Google OAuth (Gmail + Drive)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_refresh_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_email" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_connected_at" timestamp with time zone;
