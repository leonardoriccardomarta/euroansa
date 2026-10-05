import { euro, renderPdfBuffer, writeWrappedText } from "@/lib/pdf/render";

export async function buildRelazionePdf(params: {
  clientName: string;
  brokerName: string;
  body: string;
}): Promise<Buffer> {
  return renderPdfBuffer((doc) => {
    doc.font("Helvetica-Bold").fontSize(16).text("RELAZIONE PRATICA MUTUO", {
      align: "center",
    });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(11);
    doc.text(`Cliente: ${params.clientName}`);
    doc.text(`Consulente: ${params.brokerName}`);
    doc.text(`Data: ${new Date().toLocaleDateString("it-IT")}`);
    doc.moveDown(0.8);
    writeWrappedText(doc, params.body, { fontSize: 10.5, lineGap: 3 });
    doc.moveDown(1.2);
    doc.fontSize(9).fillColor("#555555");
    doc.text(
      `${params.brokerName} — generata da Prontopratica · verifica sempre i dati prima dell'invio`,
      { align: "left" },
    );
  });
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
  return renderPdfBuffer((doc) => {
    doc.font("Helvetica-Bold").fontSize(18).text("PREVENTIVO MUTUO", {
      align: "center",
    });
    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(12);
    doc.text(`Cliente: ${params.clientName}`);
    doc.moveDown(0.8);

    const line = (label: string, value: string) => {
      doc.font("Helvetica-Bold").fontSize(11).text(label, { continued: true });
      doc.font("Helvetica").text(`  ${value}`);
      doc.moveDown(0.25);
    };

    line("Costo casa:", euro(params.propertyAmount));
    line("Importo mutuo:", euro(params.loanAmount));
    line(
      "Durata:",
      params.durationYears != null ? `${params.durationYears} anni` : "—",
    );
    line("Rata:", euro(params.monthlyInstallment));
    line(
      "Tasso:",
      [
        params.ratePercent != null ? `${params.ratePercent}%` : null,
        params.rateNote,
      ]
        .filter(Boolean)
        .join(" — ") || "—",
    );
    line("Banca:", params.bankName?.trim() || "—");
    if (params.productNote?.trim()) {
      line("Prodotto:", params.productNote.trim());
    }

    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(12).text("SPESE");
    doc.moveDown(0.3);
    line("Istruttoria e perizia:", euro(params.feeIstruttoria));
    line("Imposta sostitutiva:", euro(params.feeImposta));
    line("Mediazione creditizia:", euro(params.feeMediazione));
    if (params.feeOther != null || params.feeOtherLabel) {
      line(params.feeOtherLabel?.trim() || "Altre spese:", euro(params.feeOther));
    }

    if (params.notes?.trim()) {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(12).text("NOTE");
      doc.moveDown(0.2);
      writeWrappedText(doc, params.notes.trim(), { fontSize: 10 });
    }

    doc.moveDown(1.4);
    doc.font("Helvetica-Bold").fontSize(11).text(params.brokerName.toUpperCase());
    doc.font("Helvetica").fontSize(10);
    doc.text("Consulente del credito e assicurativo");
    if (params.brokerEmail) doc.text(`Mail: ${params.brokerEmail}`);
    if (params.brokerPhone) doc.text(`Cell: ${params.brokerPhone}`);
  });
}
