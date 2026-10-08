import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { ensureSchema } from "@/lib/db/ensure-schema";

export const maxDuration = 60;

/**
 * Pulisce le pratiche aperte create dai test intake (non tocca Gmail).
 * Le mail già etichettate MUTUO-ELABORATA NON rientrano: bisogna re-inviare mail nuove.
 *
 * POST/GET + Authorization: Bearer CRON_SECRET
 * ?confirm=1 obbligatorio
 */
async function resetIntake(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("confirm") !== "1") {
    return NextResponse.json(
      {
        error: "Aggiungi ?confirm=1 per confermare la cancellazione pratiche aperte",
      },
      { status: 400 },
    );
  }

  const schema = await ensureSchema();
  if (!schema.ok) {
    return NextResponse.json(
      { ok: false, error: schema.error },
      { status: 500 },
    );
  }

  const open = await db
    .select({
      id: applications.id,
      clientName: applications.clientName,
      clientEmail: applications.clientEmail,
      status: applications.status,
    })
    .from(applications)
    .where(
      inArray(applications.status, [
        "DOCUMENTI_INCOMPLETI",
        "COMPLETA_DA_INOLTRARE",
        "IN_ATTESA_DOCUMENTI",
      ]),
    );

  if (open.length === 0) {
    return NextResponse.json({
      ok: true,
      deleted: 0,
      message: "Nessuna pratica aperta da cancellare",
    });
  }

  const ids = open.map((a) => a.id);
  // cascade documents / secretary logs via FK
  await db.delete(applications).where(inArray(applications.id, ids));

  return NextResponse.json({
    ok: true,
    deleted: ids.length,
    practices: open.map((a) => ({
      name: a.clientName,
      email: a.clientEmail,
      status: a.status,
    })),
    note: "Le mail Gmail già con label MUTUO-ELABORATA non rientrano. Re-invia mail NUOVE con oggetto EUROANSA-MUTUO.",
  });
}

export const GET = resetIntake;
export const POST = resetIntake;
