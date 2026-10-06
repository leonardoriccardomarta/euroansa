import { euro, renderPdfBuffer, writeWrappedText } from "@/lib/pdf/render";

function clean(value: string): string {
  return value
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function buildPreventivoPdf(params: {
  clientName: string;
  brokerName: string;
  brokerPhone?: string | null;
  brokerEmail?: string | null;
  propertyAmount?: number | null;
  loanAmount?: number | null;
  durationYears?: number | null;
  monthlyInstallment?: number | null;
  ratePercent?: number | null;
  rateNote?: string | null;
  bankName?: string | null;
  productNote?: string | null;
  feeIstruttoria?: number | null;
  feeImposta?: number | null;
  feeMediazione?: number | null;
  feeOther?: number | null;
  feeOtherLabel?: string | null;
  notes?: string | null;
}): Promise<Buffer> {
  const today = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const rateParts = [
    params.ratePercent != null ? `${params.ratePercent}%` : null,
    params.rateNote?.trim() ? clean(params.rateNote.trim()) : null,
  ].filter(Boolean);
  const rateLine = rateParts.length ? rateParts.join(", ") : "da definire";

  const fees = [
    { label: "Istruttoria e perizia", value: params.feeIstruttoria },
    { label: "Imposta sostitutiva", value: params.feeImposta },
    { label: "Mediazione creditizia", value: params.feeMediazione },
    {
      label: params.feeOtherLabel?.trim()
        ? clean(params.feeOtherLabel.trim())
        : "Altre spese",
      value: params.feeOther,
      always:
        Boolean(params.feeOtherLabel?.trim()) || params.feeOther != null,
    },
  ].filter(
    (f) =>
      ("always" in f && f.always) ||
      (f.value != null && !Number.isNaN(f.value)),
  );

  return renderPdfBuffer((doc) => {
    const left = doc.page.margins.left;
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Header band
    doc.save();
    doc.rect(0, 0, doc.page.width, 72).fill("#0f172a");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18);
    doc.text("PREVENTIVO DI MUTUO", left, 22, { width: usable, align: "left" });
    doc.font("Helvetica").fontSize(9).fillColor("#cbd5e1");
    doc.text(`Documento riservato  ·  ${today}`, left, 46, {
      width: usable,
      align: "left",
    });
    doc.restore();
    doc.y = 92;

    const section = (title: string) => {
      doc.moveDown(0.35);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
      doc.text(title.toUpperCase());
      const y = doc.y + 2;
      doc
        .moveTo(left, y)
        .lineTo(left + usable, y)
        .strokeColor("#e2e8f0")
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.55);
    };

    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor("#64748b");
      doc.text(label, left, y, { width: 190, continued: false });
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
      doc.text(value, left + 200, y, { width: usable - 200 });
      doc.y = Math.max(doc.y, y + 16);
    };

    section("Intestazione");
    row("Cliente", params.clientName);
    row("Consulente", params.brokerName);
    doc.moveDown(0.4);

    section("Sintesi dell'operazione");
    row("Valore immobile", euro(params.propertyAmount));
    row("Importo mutuo richiesto", euro(params.loanAmount));
    row(
      "Durata",
      params.durationYears != null
        ? `${params.durationYears} anni`
        : "da definire",
    );
    row("Rata mensile indicativa", euro(params.monthlyInstallment));
    row("Tasso", rateLine);
    row("Istituto", params.bankName?.trim() || "da definire");
    if (params.productNote?.trim()) {
      row("Prodotto", clean(params.productNote.trim()));
    }

    if (fees.length) {
      doc.moveDown(0.4);
      section("Spese previste");
      for (const f of fees) {
        row(f.label, euro(f.value));
      }
    }

    if (params.notes?.trim()) {
      doc.moveDown(0.4);
      section("Note");
      doc.font("Helvetica").fontSize(10).fillColor("#334155");
      writeWrappedText(doc, clean(params.notes.trim()), {
        fontSize: 10,
        lineGap: 3,
      });
    }

    doc.moveDown(1.1);
    doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
    writeWrappedText(
      doc,
      "Il presente preventivo ha valore indicativo e non costituisce offerta vincolante. Tassi, condizioni e spese sono soggetti a conferma dell'istituto erogante e alla valutazione creditizia definitiva.",
      { fontSize: 8, lineGap: 2 },
    );

    doc.moveDown(1.4);
    const sigY = doc.y;
    doc
      .moveTo(left, sigY)
      .lineTo(left + 220, sigY)
      .strokeColor("#cbd5e1")
      .lineWidth(0.8)
      .stroke();
    doc.moveDown(0.35);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
    doc.text(params.brokerName.toUpperCase());
    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text("Consulente del credito e assicurativo");
    if (params.brokerEmail) doc.text(params.brokerEmail);
    if (params.brokerPhone) doc.text(`Tel. ${params.brokerPhone}`);
  });
}
