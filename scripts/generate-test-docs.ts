/**
 * Genera PDF di prova per test Euroansa (anagrafica finta ma leggibile dall'AI).
 * Esegui: npx tsx scripts/generate-test-docs.ts
 */
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const OUT = path.join(process.cwd(), "test-documents");

const PERSONA = {
  nome: "Mario",
  cognome: "Rossi",
  cf: "RSSMRA85M01H501Z",
  nascita: "01/08/1985",
  luogo: "Roma",
  scadenzaCI: "15/03/2031",
  indirizzo: "Via Roma 12, 00100 Roma",
};

function writePdf(
  fileName: string,
  draw: (doc: PDFKit.PDFDocument) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(path.join(OUT, fileName));
    doc.pipe(stream);
    draw(doc);
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  await writePdf("01_carta_identita.pdf", (doc) => {
    doc.fontSize(18).text("REPUBBLICA ITALIANA", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).text("CARTA DI IDENTITA' / IDENTITY CARD", {
      align: "center",
    });
    doc.moveDown(1.5);
    doc.fontSize(12);
    doc.text(`Cognome / Surname: ${PERSONA.cognome}`);
    doc.text(`Nome / Name: ${PERSONA.nome}`);
    doc.text(`Data di nascita / Date of birth: ${PERSONA.nascita}`);
    doc.text(`Luogo di nascita / Place of birth: ${PERSONA.luogo}`);
    doc.text(`Codice fiscale / Fiscal code: ${PERSONA.cf}`);
    doc.text(`Indirizzo / Address: ${PERSONA.indirizzo}`);
    doc.text(`Data di scadenza / Expiry date: ${PERSONA.scadenzaCI}`);
    doc.moveDown();
    doc.text("Documento valido e leggibile (TEST EUROANSA).");
  });

  await writePdf("02_tessera_sanitaria.pdf", (doc) => {
    doc.fontSize(18).text("TESSERA SANITARIA", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).text("TEAM - Tessera Europea di Assicurazione Malattia", {
      align: "center",
    });
    doc.moveDown(1.5);
    doc.text(`Cognome: ${PERSONA.cognome}`);
    doc.text(`Nome: ${PERSONA.nome}`);
    doc.text(`Codice fiscale: ${PERSONA.cf}`);
    doc.text("Numero tessera: 8000000012345678");
    doc.text("Scadenza: 31/12/2029");
    doc.moveDown();
    doc.text("Documento di test Euroansa.");
  });

  const buste = [
    { file: "03_busta_paga_gennaio.pdf", mese: "Gennaio 2026", netto: 1850.4, trattenute: 120 },
    { file: "04_busta_paga_febbraio.pdf", mese: "Febbraio 2026", netto: 1845.2, trattenute: 120 },
    { file: "05_busta_paga_marzo.pdf", mese: "Marzo 2026", netto: 1860.0, trattenute: 120 },
  ];

  for (const b of buste) {
    await writePdf(b.file, (doc) => {
      doc.fontSize(16).text("CEDOLINO PAGA / BUSTA PAGA", { align: "center" });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Datore di lavoro: ACME S.r.l.`);
      doc.text(`Dipendente: ${PERSONA.cognome} ${PERSONA.nome}`);
      doc.text(`Codice fiscale: ${PERSONA.cf}`);
      doc.text(`Mese di riferimento: ${b.mese}`);
      doc.moveDown();
      doc.text("Retribuzione lorda: Euro 2450.00");
      doc.text("Contributi e IRPEF: Euro 479.60");
      doc.text(`Trattenute finanziamenti / cessione del quinto: Euro ${b.trattenute.toFixed(2)}`);
      doc.moveDown();
      doc.fontSize(13).text(`NETTO IN BUSTA: Euro ${b.netto.toFixed(2)}`);
      doc.moveDown();
      doc.fontSize(10).text("Documento di test Euroansa.");
    });
  }

  await writePdf("06_cud_2025.pdf", (doc) => {
    doc.fontSize(16).text("CERTIFICAZIONE UNICA (CUD) 2025", {
      align: "center",
    });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Cognome: ${PERSONA.cognome}`);
    doc.text(`Nome: ${PERSONA.nome}`);
    doc.text(`Codice fiscale: ${PERSONA.cf}`);
    doc.text("Anno di imposta: 2025");
    doc.moveDown();
    doc.text("Reddito di lavoro dipendente lordo annuo: Euro 29400.00");
    doc.text("Ritenute IRPEF: Euro 4200.00");
    doc.moveDown();
    doc.text("Documento di test Euroansa (CUD/730 semplificato).");
  });

  const readme = `Documenti di test Euroansa
========================

Persona finta:
- Nome: ${PERSONA.nome} ${PERSONA.cognome}
- CF: ${PERSONA.cf}
- CI scadenza: ${PERSONA.scadenzaCI}

Come usare:
1. Allega questi PDF a una email
2. Destinatario: la TUA Gmail collegata a Google OAuth
3. Oggetto: [EUROANSA-MUTUO] Documenti Rossi Mario
4. Aspetta cron-job.org oppure chiama /api/cron/check-emails
5. In dashboard deve comparire la pratica con badge Test
   (se il mittente = ADMIN_EMAIL)

File:
- 01_carta_identita.pdf
- 02_tessera_sanitaria.pdf
- 03/04/05_busta_paga_*.pdf (netto ~1850, trattenute 120)
- 06_cud_2025.pdf (lordo annuo 29400)
`;

  fs.writeFileSync(path.join(OUT, "LEGGIMI.txt"), readme, "utf8");
  console.log("Creati in", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
