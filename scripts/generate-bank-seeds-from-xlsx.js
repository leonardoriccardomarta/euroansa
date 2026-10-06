/**
 * Genera src/lib/banks/seed-data.json dal file Excel SCHEDA BANCHE.
 * Uso: node scripts/generate-bank-seeds-from-xlsx.js [path.xlsx]
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const xlsxPath =
  process.argv[2] || path.join(__dirname, "scheda-banche.xlsx");
const outPath = path.join(__dirname, "../src/lib/banks/seed-data.json");

const SHEET_TO_BANK = {
  MPS: "MPS",
  "CREDIT-AGRICOLE": "CREDIT AGRICOLE",
  "CHE BANCA": "CHE BANCA",
  ING: "ING",
  "EXTRA BANCA": "EXTRABANCA",
  BNL: "BNL",
  "CR ASTI": "CR ASTI",
  BPM: "BPM",
  VALSABBINA: "VALSABBINA",
  BPER: "BPER",
  INTESA: "INTESA",
  BCC: "BCC",
  BTL: "BTL",
};

const NAME_MAP = { "MONTE PASCHI": "MPS" };
const SORT = [
  "ING",
  "BPER",
  "CREDIT AGRICOLE",
  "MPS",
  "EXTRABANCA",
  "VALSABBINA",
  "BNL",
  "BPM",
  "CR ASTI",
  "BDM BANCA",
  "CHE BANCA",
  "BTL",
  "UNICREDIT",
  "BCC",
  "INTESA",
];

const LABEL_FIX = {
  "IMPEGNI IN ESSEREA BREVE SCADENZA": "IMPEGNI IN ESSERE A BREVE SCADENZA",
  ASSICURAZIONESUGGERITE: "ASSICURAZIONI SUGGERITE",
  "ASSICURAZIONE SUGGERITE": "ASSICURAZIONI SUGGERITE",
  "RIENTRO DEI CERVELLIRIMPATRIATI": "RIENTRO CERVELLI / RIMPATRIATI",
  "RIENTRO DEI CERVELLI RIMPATRIATI": "RIENTRO CERVELLI / RIMPATRIATI",
  "PROV MASSIME RICHIEDIBILI AL CLIENTE": "PROV. MASSIME CLIENTE",
  "INCAS RATA CONSAP": "INCASSO RATA CONSAP",
};

function clean(v) {
  return String(v ?? "")
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function slugify(name) {
  if (name === "MPS") return "mps";
  if (name === "BDM BANCA") return "bdm";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function sheetToDetailText(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const lines = [];
  for (const row of rows) {
    const cells = row.map(clean).filter(Boolean);
    if (!cells.length) continue;
    if (cells.length === 1) lines.push(cells[0]);
    else lines.push(`${cells[0]}: ${cells.slice(1).join(" · ")}`);
  }
  return lines.join("\n").trim();
}

function parseRiepilogo(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerIdx = matrix.findIndex((r) =>
    r.some((c) => /BDM BANCA/i.test(String(c || ""))),
  );
  if (headerIdx < 0) throw new Error("RIEPILOGO: header banche non trovato");
  const header = matrix[headerIdx].map(clean);
  const bankStart = header.findIndex((c) => /BDM BANCA/i.test(c));
  const banks = header.slice(bankStart).filter(Boolean);

  const criteria = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i].map(clean);
    const labelRaw = r[1] || r[0] || "";
    if (!labelRaw) continue;
    const values = r.slice(bankStart);
    if (values.every((v) => !v)) continue;
    const norm = labelRaw.replace(/\s+/g, " ");
    criteria.push({ label: LABEL_FIX[norm] || norm, values });
  }

  const consapRow = matrix.find(
    (r, idx) =>
      idx < headerIdx && r.some((c) => /CONSAP/i.test(String(c || ""))),
  );
  if (consapRow) {
    const values = consapRow.map(clean).slice(bankStart);
    if (values.some(Boolean)) {
      criteria.unshift({ label: "CONSAP", values });
    }
  }

  return { banks, criteria };
}

const wb = XLSX.readFile(xlsxPath);
if (!wb.Sheets["RIEPILOGO BANCHE"]) {
  throw new Error("Foglio RIEPILOGO BANCHE mancante");
}

const { banks, criteria } = parseRiepilogo(wb.Sheets["RIEPILOGO BANCHE"]);
const byName = new Map();

for (let col = 0; col < banks.length; col++) {
  const mapped = NAME_MAP[banks[col]] || banks[col];
  const rows = [];
  for (const c of criteria) {
    const value = c.values[col] || "";
    if (!value) continue;
    if (/^CONSAP$/i.test(c.label) && /^CONSAP$/i.test(value)) continue;
    rows.push({ label: c.label, value });
  }
  byName.set(mapped, {
    bankName: mapped,
    slug: slugify(mapped),
    rows,
    detailText: "",
  });
}

for (const [sheetName, bankName] of Object.entries(SHEET_TO_BANK)) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.warn("Missing sheet", sheetName);
    continue;
  }
  const detailText = sheetToDetailText(sheet);
  const existing = byName.get(bankName);
  if (existing) {
    existing.detailText = detailText;
  } else {
    byName.set(bankName, {
      bankName,
      slug: slugify(bankName),
      rows: [],
      detailText,
    });
  }
}

const list = [...byName.values()].sort((a, b) => {
  const ia = SORT.indexOf(a.bankName);
  const ib = SORT.indexOf(b.bankName);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});

const seeds = list.map((b, idx) => {
  const durata = b.rows.find((r) => /^DURATA$/i.test(r.label))?.value;
  const consap = b.rows.find((r) => /^CONSAP$/i.test(r.label))?.value;
  const parts = [];
  if (durata) parts.push(durata.replace(/\s+/g, " ").slice(0, 90));
  if (consap) parts.push(consap.replace(/\s+/g, " ").slice(0, 50));
  if (!parts.length && b.detailText) {
    parts.push(b.detailText.split("\n")[0].slice(0, 90));
  }
  return {
    bankName: b.bankName,
    slug: b.slug,
    summary: parts.join(". ") || `Policy ${b.bankName}`,
    sortOrder: (idx + 1) * 10,
    rows: b.rows,
    detailText: b.detailText || null,
  };
});

fs.writeFileSync(outPath, JSON.stringify(seeds, null, 2), "utf8");
console.log("Wrote", outPath);
for (const s of seeds) {
  console.log(
    s.bankName,
    "rows=" + s.rows.length,
    "detail=" + (s.detailText ? s.detailText.length + "c" : "no"),
  );
}
