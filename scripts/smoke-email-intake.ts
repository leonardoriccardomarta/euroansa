/**
 * Smoke: oggetto EUROANSA-MUTUO (+ [EXT], bracket) e creazione pratica da PDF finto.
 *
 *   npx tsx scripts/smoke-email-intake.ts
 *
 * Richiede DATABASE_URL (+ R2/Gemini se vuoi il percorso completo AI).
 * Senza Gemini: crea comunque la pratica via insert diretto con CF finto.
 */
import "dotenv/config";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { applications, documents } from "../src/db/schema";
import {
  buildGmailSubjectQuery,
  subjectMatchesTag,
} from "../src/lib/google/gmail";
import { defaultStorageFolders } from "../src/lib/config/documents";
import { processIncomingFiles } from "../src/lib/pipeline";

const TAG = process.env.GMAIL_SUBJECT_TAG?.trim() || "EUROANSA-MUTUO";
const TOKEN = TAG.replace(/[\[\]]/g, "").trim();
const SMOKE_CF = "SMKSTT80A01H501Z";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK  ${msg}`);
}

async function makeFakePdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(14).text("Documento finto smoke Prontopratica");
    doc.text("Nome: Smoke Test");
    doc.text(`Codice fiscale: ${SMOKE_CF}`);
    doc.text("Carta di identità (simulata)");
    doc.end();
  });
}

async function main() {
  console.log("--- subject match ---");
  const q = buildGmailSubjectQuery(TAG);
  assert(q === `subject:"${TOKEN}"`, `query = ${q}`);
  assert(
    q.includes('"') && q.includes(TOKEN),
    "query con virgolette e token senza bracket",
  );

  const subjects = [
    "EUROANSA-MUTUO",
    "EUROANSA MUTUO",
    "[EUROANSA-MUTUO] Documenti Rossi",
    "[EXT] EUROANSA-MUTUO",
    "[EXT] EUROANSA MUTUO allegati",
    `[EXT] [${TOKEN}] allegati`,
  ];
  for (const s of subjects) {
    assert(subjectMatchesTag(s, TAG), `match soggetto: ${s}`);
  }
  assert(
    !subjectMatchesTag("Richiesta info mutuo", TAG),
    "non matcha oggetto senza tag",
  );

  console.log("\n--- pratica da documento finto ---");
  const pdf = await makeFakePdf();

  // Pulisci eventuali smoke precedenti
  const old = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.clientFiscalCode, SMOKE_CF));
  for (const row of old) {
    await db.delete(applications).where(eq(applications.id, row.id));
  }

  let appId: string | null = null;
  let usedAi = false;

  if (process.env.GEMINI_API_KEY && process.env.R2_BUCKET_NAME) {
    usedAi = true;
    const result = await processIncomingFiles(
      [
        {
          buffer: pdf,
          mimeType: "application/pdf",
          originalFileName: "smoke_ci.pdf",
          // Simula autoinvio da casella ufficio
          clientEmail:
            process.env.ADMIN_EMAIL?.trim() || "ufficio@euroansa.it",
          clientNameHint: "Smoke Test",
        },
      ],
      { isTest: false },
    );
    console.log("processIncomingFiles", result);
    assert(result.applicationIds.length > 0, "pratica creata da pipeline AI");
    appId = result.applicationIds[0] ?? null;
    if (result.errors.length) {
      console.warn("pipeline warnings:", result.errors.slice(0, 3));
    }
  } else {
    console.log(
      "(GEMINI/R2 assenti → creo pratica diretta con CF, come farebbe il match post-OCR)",
    );
    const [created] = await db
      .insert(applications)
      .values({
        clientName: "Smoke Test",
        clientEmail: `cf.${SMOKE_CF.toLowerCase()}@prontopratica.local`,
        clientFiscalCode: SMOKE_CF,
        status: "DOCUMENTI_INCOMPLETI",
        isTest: false,
        storageFolders: defaultStorageFolders("Smoke Test"),
      })
      .returning({ id: applications.id, isTest: applications.isTest });
    assert(Boolean(created?.id), "pratica insert ok");
    assert(created!.isTest === false, "isTest=false anche da autoinvio");
    appId = created!.id;
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, appId!))
    .limit(1);
  assert(Boolean(app), "pratica leggibile");
  assert(app!.isTest === false, "pratica NON test");
  console.log(
    `\nSMOKE OK — app ${app!.id} | isTest=${app!.isTest} | AI=${usedAi} | subject tag=${TAG}`,
  );
  console.log(
    `Query Gmail che userà il cron: -label:MUTUO-ELABORATA ${q}`,
  );

  // Cleanup smoke
  await db.delete(documents).where(eq(documents.applicationId, app!.id));
  await db.delete(applications).where(eq(applications.id, app!.id));
  console.log("cleanup smoke ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
