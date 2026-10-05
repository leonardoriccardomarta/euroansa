import PDFDocument from "pdfkit";

export async function renderPdfBuffer(
  draw: (doc: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    draw(doc);
    doc.end();
  });
}

export function writeWrappedText(
  doc: PDFKit.PDFDocument,
  text: string,
  opts?: { fontSize?: number; lineGap?: number },
) {
  const fontSize = opts?.fontSize ?? 11;
  const lineGap = opts?.lineGap ?? 4;
  doc.font("Helvetica").fontSize(fontSize);
  for (const paragraph of text.split(/\n/)) {
    if (!paragraph.trim()) {
      doc.moveDown(0.4);
      continue;
    }
    doc.text(paragraph, { lineGap, paragraphGap: 2 });
  }
}

export function euro(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}
