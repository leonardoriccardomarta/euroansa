import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const db = drizzle(neon(url), { schema });

  const email = (process.env.ADMIN_EMAIL ?? "admin@euroansa.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin123456";
  const passwordHash = await bcrypt.hash(password, 10);

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!existing) {
    await db.insert(schema.users).values({
      email,
      name: "Admin",
      passwordHash,
      role: "ADMIN",
    });
    console.log("Admin creato:", email);
  } else {
    console.log("Admin già presente:", email);
  }

  const [settings] = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.id, "global"))
    .limit(1);

  if (!settings) {
    await db.insert(schema.systemSettings).values({
      id: "global",
      secretaryEmail:
        process.env.SECRETARY_EMAIL_DEFAULT ?? "segreteria@example.com",
      brokerName: "Euroansa",
      autoSendToSecretary: true,
    });
    console.log("Settings globali create");
  }

  console.log("Seed completato");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
