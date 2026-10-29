export type Rogitata2026Record = {
  clientName: string;
  phone: string | null;
  loanAmount: number | null;
  propertyAmount: number | null;
  ltvPercent: number | null;
  provenance: string | null;
  bankName: string | null;
  notaryName: string | null;
  appraiserName: string | null;
  commissionPolicy: number | null;
  commissionCqs: number | null;
  commissionBank: number | null;
  commissionClient: number | null;
  commissionLoans: number | null;
  commissionNotary: number | null;
  operationType: string;
  month: string;
  rogitoAt: string; // ISO date string
};

export const GOOGLE_SHEET_2026_URL =
  "https://docs.google.com/spreadsheets/d/1DRpeLPYQB77xG_6CpGn_caGFqiGvgLce/edit?usp=sharing&ouid=115840255119797218450&rtpof=true&sd=true";

export const GOOGLE_SHEET_EXPORT_URL =
  "https://docs.google.com/spreadsheets/d/1DRpeLPYQB77xG_6CpGn_caGFqiGvgLce/export?format=xlsx";

/**
 * Embedded dataset estrapolato fedelmente dal foglio ufficiale PRATICHE CONCLUSE 2026
 * di Filippo Carriero (25 pratiche chiuse da Febbraio a Luglio 2026).
 */
export const EMBEDDED_ROGITATE_2026: Rogitata2026Record[] = [
  // FEBBRAIO 2026
  {
    clientName: "ZIDANE",
    phone: null,
    loanAmount: 125000,
    propertyAmount: 133000,
    ltvPercent: 0.9398,
    provenance: "DIRETTA",
    bankName: "ING",
    notaryName: "FINARDI",
    appraiserName: null,
    commissionPolicy: null,
    commissionCqs: null,
    commissionBank: 3187,
    commissionClient: 1500,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "FEBBRAIO",
    rogitoAt: "2026-02-15T12:00:00.000Z",
  },
  {
    clientName: "DANJO",
    phone: null,
    loanAmount: 120000,
    propertyAmount: 123000,
    ltvPercent: 0.9756,
    provenance: "TC RIVOLTA",
    bankName: "VALSABBINA",
    notaryName: "ZACCHEI",
    appraiserName: null,
    commissionPolicy: 3144,
    commissionCqs: null,
    commissionBank: 1320,
    commissionClient: 2500,
    commissionLoans: null,
    commissionNotary: 900,
    operationType: "MUTUO",
    month: "FEBBRAIO",
    rogitoAt: "2026-02-15T12:00:00.000Z",
  },
  {
    clientName: "ALESSIO DANIELE",
    phone: null,
    loanAmount: 97600,
    propertyAmount: 122000,
    ltvPercent: 0.8,
    provenance: "SAMUELE CURTI",
    bankName: "BPER",
    notaryName: "FINARDI",
    appraiserName: null,
    commissionPolicy: 3080,
    commissionCqs: 1068,
    commissionBank: 1464,
    commissionClient: 2550,
    commissionLoans: 633,
    commissionNotary: null,
    operationType: "MUTUO+CQS",
    month: "FEBBRAIO",
    rogitoAt: "2026-02-15T12:00:00.000Z",
  },
  {
    clientName: "HICHAM",
    phone: null,
    loanAmount: 103000,
    propertyAmount: 130000,
    ltvPercent: 0.7923,
    provenance: "DIRETTA",
    bankName: "MPS",
    notaryName: "TATARANNO",
    appraiserName: null,
    commissionPolicy: 0,
    commissionCqs: null,
    commissionBank: 515,
    commissionClient: 1500,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "FEBBRAIO",
    rogitoAt: "2026-02-15T12:00:00.000Z",
  },
  {
    clientName: "ROTUNDU",
    phone: null,
    loanAmount: 150000,
    propertyAmount: 150000,
    ltvPercent: 1.0,
    provenance: "TC VAILATE",
    bankName: "BDM",
    notaryName: "CONFALONIERI",
    appraiserName: null,
    commissionPolicy: 3624,
    commissionCqs: null,
    commissionBank: 1200,
    commissionClient: 2500,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "FEBBRAIO",
    rogitoAt: "2026-02-15T12:00:00.000Z",
  },

  // MARZO 2026
  {
    clientName: "DEGANI",
    phone: null,
    loanAmount: 129000,
    propertyAmount: 140000,
    ltvPercent: 0.9214,
    provenance: "TC VAILATE",
    bankName: "BPER",
    notaryName: "CONFALONIERI",
    appraiserName: "GABRIELE BIANCHI",
    commissionPolicy: 0,
    commissionCqs: null,
    commissionBank: 645,
    commissionClient: 1500,
    commissionLoans: 234,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },
  {
    clientName: "ESLAM",
    phone: null,
    loanAmount: 107350,
    propertyAmount: 113000,
    ltvPercent: 0.95,
    provenance: "DIRETTA",
    bankName: "ING",
    notaryName: "DI MARO",
    appraiserName: "CAZZANIGA",
    commissionPolicy: 4000,
    commissionCqs: null,
    commissionBank: 2875,
    commissionClient: 2200,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },
  {
    clientName: "OLEKSANDR",
    phone: null,
    loanAmount: 87400,
    propertyAmount: 92000,
    ltvPercent: 0.95,
    provenance: "HOMS",
    bankName: "ING",
    notaryName: "RICCARDO BANDI",
    appraiserName: "CAZZANIGA",
    commissionPolicy: 2600,
    commissionCqs: null,
    commissionBank: 2354,
    commissionClient: 2000,
    commissionLoans: null,
    commissionNotary: 700,
    operationType: "MUTUO",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },
  {
    clientName: "ISUFI",
    phone: null,
    loanAmount: 95000,
    propertyAmount: 119000,
    ltvPercent: 0.7983,
    provenance: "DIRETTA",
    bankName: "VALSABBINA",
    notaryName: "FRANCO",
    appraiserName: null,
    commissionPolicy: 0,
    commissionCqs: null,
    commissionBank: 1045,
    commissionClient: 600,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },
  {
    clientName: "IBRA THIAM",
    phone: null,
    loanAmount: 88000,
    propertyAmount: 110000,
    ltvPercent: 0.8,
    provenance: "RAFFAELLA CORTESI",
    bankName: "VALSABBINA",
    notaryName: "ZACCHEI",
    appraiserName: null,
    commissionPolicy: 3000,
    commissionCqs: null,
    commissionBank: 968,
    commissionClient: 2000,
    commissionLoans: null,
    commissionNotary: 2100,
    operationType: "MUTUO",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },
  {
    clientName: "IRFAN",
    phone: null,
    loanAmount: 137000,
    propertyAmount: 145000,
    ltvPercent: 0.9448,
    provenance: "ITALCASA",
    bankName: "ING",
    notaryName: "LUOSI",
    appraiserName: null,
    commissionPolicy: 6660,
    commissionCqs: null,
    commissionBank: 3123,
    commissionClient: 2500,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },
  {
    clientName: "ACCORDI CQS",
    phone: null,
    loanAmount: null,
    propertyAmount: null,
    ltvPercent: null,
    provenance: "MATTIA RAVASI",
    bankName: "FIGENPA",
    notaryName: null,
    appraiserName: null,
    commissionPolicy: null,
    commissionCqs: 1131,
    commissionBank: null,
    commissionClient: null,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "CQS",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },
  {
    clientName: "IRYNA PRESTITO",
    phone: null,
    loanAmount: null,
    propertyAmount: null,
    ltvPercent: null,
    provenance: "DIRETTA",
    bankName: "AGOS",
    notaryName: null,
    appraiserName: null,
    commissionPolicy: null,
    commissionCqs: null,
    commissionBank: null,
    commissionClient: null,
    commissionLoans: 108,
    commissionNotary: null,
    operationType: "PRESTITO",
    month: "MARZO",
    rogitoAt: "2026-03-15T12:00:00.000Z",
  },

  // APRILE 2026
  {
    clientName: "RISINA LORIS",
    phone: null,
    loanAmount: 137500,
    propertyAmount: 140000,
    ltvPercent: 0.9821,
    provenance: "LOMBARDIA IMMOBILI",
    bankName: "BDM",
    notaryName: "ZACCHEI",
    appraiserName: null,
    commissionPolicy: 0,
    commissionCqs: null,
    commissionBank: 1100,
    commissionClient: 1900,
    commissionLoans: null,
    commissionNotary: 600,
    operationType: "MUTUO",
    month: "APRILE",
    rogitoAt: "2026-04-15T12:00:00.000Z",
  },
  {
    clientName: "SOW KORKA",
    phone: null,
    loanAmount: 70000,
    propertyAmount: 70000,
    ltvPercent: 1.0,
    provenance: "DIRETTA",
    bankName: "VALSABBINA",
    notaryName: "ZACCHEI",
    appraiserName: "NAVA",
    commissionPolicy: 2000,
    commissionCqs: null,
    commissionBank: 770,
    commissionClient: 2000,
    commissionLoans: null,
    commissionNotary: 2500,
    operationType: "MUTUO",
    month: "APRILE",
    rogitoAt: "2026-04-15T12:00:00.000Z",
  },
  {
    clientName: "ALAMGIR",
    phone: null,
    loanAmount: 92000,
    propertyAmount: 97000,
    ltvPercent: 0.9485,
    provenance: "SERVIZI IMMOBILIARI",
    bankName: "ING",
    notaryName: "ZACCHEI",
    appraiserName: "CAZZANIGA",
    commissionPolicy: 4300,
    commissionCqs: null,
    commissionBank: 2518,
    commissionClient: 2000,
    commissionLoans: null,
    commissionNotary: 900,
    operationType: "MUTUO",
    month: "APRILE",
    rogitoAt: "2026-04-15T12:00:00.000Z",
  },

  // MAGGIO 2026
  {
    clientName: "BELTRAMI",
    phone: null,
    loanAmount: 150000,
    propertyAmount: 158000,
    ltvPercent: 0.9494,
    provenance: "TC CARAVAGGIO",
    bankName: "ING",
    notaryName: "LUOSI",
    appraiserName: "BONO",
    commissionPolicy: 7300,
    commissionCqs: null,
    commissionBank: 3625,
    commissionClient: 2000,
    commissionLoans: 928,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "MAGGIO",
    rogitoAt: "2026-05-15T12:00:00.000Z",
  },
  {
    clientName: "ATEF",
    phone: null,
    loanAmount: 69350,
    propertyAmount: 73000,
    ltvPercent: 0.95,
    provenance: "TC CARAVAGGIO",
    bankName: "ING",
    notaryName: "LUOSI",
    appraiserName: "CAZZANIGA",
    commissionPolicy: 3000,
    commissionCqs: null,
    commissionBank: 2213,
    commissionClient: 2300,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "MAGGIO",
    rogitoAt: "2026-05-15T12:00:00.000Z",
  },
  {
    clientName: "HAFEZ SABRY",
    phone: null,
    loanAmount: 60000,
    propertyAmount: 75000,
    ltvPercent: 0.8,
    provenance: "DIRETTA",
    bankName: "BPER",
    notaryName: "BARATTERI",
    appraiserName: "GIOVANNA DRAGO",
    commissionPolicy: null,
    commissionCqs: null,
    commissionBank: 900,
    commissionClient: 1500,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "MAGGIO",
    rogitoAt: "2026-05-15T12:00:00.000Z",
  },

  // GIUGNO 2026
  {
    clientName: "BRIGUGLIO SAMUEL CQS",
    phone: null,
    loanAmount: null,
    propertyAmount: null,
    ltvPercent: null,
    provenance: "DIRETTA",
    bankName: "FIGENPA",
    notaryName: null,
    appraiserName: null,
    commissionPolicy: null,
    commissionCqs: 1600,
    commissionBank: null,
    commissionClient: null,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "CQS",
    month: "GIUGNO",
    rogitoAt: "2026-06-15T12:00:00.000Z",
  },
  {
    clientName: "IMPOCO",
    phone: null,
    loanAmount: 140000,
    propertyAmount: 148000,
    ltvPercent: 0.9459,
    provenance: "STUDIOCASA CARAVAGGIO",
    bankName: "ING",
    notaryName: "DI MARO",
    appraiserName: "CAZZANIGA",
    commissionPolicy: 6200,
    commissionCqs: null,
    commissionBank: 3450,
    commissionClient: 2500,
    commissionLoans: null,
    commissionNotary: 1200,
    operationType: "MUTUO",
    month: "GIUGNO",
    rogitoAt: "2026-06-15T12:00:00.000Z",
  },

  // LUGLIO 2026
  {
    clientName: "SIGNORELLI",
    phone: null,
    loanAmount: 155000,
    propertyAmount: 155000,
    ltvPercent: 1.0,
    provenance: "TC CARAVAGGIO",
    bankName: "BDM",
    notaryName: "LUOSI",
    appraiserName: "ANGELI",
    commissionPolicy: 2500,
    commissionCqs: null,
    commissionBank: 1240,
    commissionClient: 2200,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "LUGLIO",
    rogitoAt: "2026-07-15T12:00:00.000Z",
  },
  {
    clientName: "VERDUCCI",
    phone: null,
    loanAmount: 113000,
    propertyAmount: 119000,
    ltvPercent: 0.9496,
    provenance: "STUDIOCASA URGNANO",
    bankName: "ING",
    notaryName: "ZACCHEI",
    appraiserName: null,
    commissionPolicy: 6000,
    commissionCqs: null,
    commissionBank: 2977,
    commissionClient: 2200,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "LUGLIO",
    rogitoAt: "2026-07-15T12:00:00.000Z",
  },
  {
    clientName: "NABIL",
    phone: null,
    loanAmount: 109250,
    propertyAmount: 115000,
    ltvPercent: 0.95,
    provenance: "REMAX",
    bankName: "ING",
    notaryName: "ZACCHEI",
    appraiserName: "CAZZANIGA",
    commissionPolicy: 5000,
    commissionCqs: null,
    commissionBank: 2911,
    commissionClient: 2400,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "MUTUO",
    month: "LUGLIO",
    rogitoAt: "2026-07-15T12:00:00.000Z",
  },
  {
    clientName: "CQS ZIDANE",
    phone: null,
    loanAmount: null,
    propertyAmount: null,
    ltvPercent: null,
    provenance: "DIRETTA",
    bankName: "ITALCREDIT",
    notaryName: null,
    appraiserName: null,
    commissionPolicy: null,
    commissionCqs: 550,
    commissionBank: null,
    commissionClient: null,
    commissionLoans: null,
    commissionNotary: null,
    operationType: "CQS",
    month: "LUGLIO",
    rogitoAt: "2026-07-15T12:00:00.000Z",
  },
];

const MONTHS_MAP: Record<string, number> = {
  GENNAIO: 0,
  FEBBRAIO: 1,
  MARZO: 2,
  APRILE: 3,
  MAGGIO: 4,
  GIUGNO: 5,
  LUGLIO: 6,
  AGOSTO: 7,
  SETTEMBRE: 8,
  OTTOBRE: 9,
  NOVEMBRE: 10,
  DICEMBRE: 11,
};

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v)
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * Tenta di scaricare il file Excel aggiornato dal Google Sheet pubblico,
 * estraendo le pratiche del foglio "PRATICHE CONCLUSE".
 * In caso di fallimento di rete o indisponibilità, fa fallback sui dati incorporati.
 */
export async function fetchLiveOrEmbedded2026Data(): Promise<{
  records: Rogitata2026Record[];
  source: "live_sheet" | "embedded";
}> {
  try {
    const res = await fetch(GOOGLE_SHEET_EXPORT_URL, {
      method: "GET",
      headers: {
        Accept:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.warn(
        `fetch Google Sheet returned ${res.status}, using embedded dataset`,
      );
      return { records: EMBEDDED_ROGITATE_2026, source: "embedded" };
    }

    const arrayBuf = await res.arrayBuffer();
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(arrayBuf), { type: "buffer" });
    const ws =
      wb.Sheets["PRATICHE CONCLUSE"] ||
      wb.Sheets[wb.SheetNames.find((n) => /conclu/i.test(n)) ?? ""];

    if (!ws) {
      console.warn("Sheet PRATICHE CONCLUSE not found, using embedded dataset");
      return { records: EMBEDDED_ROGITATE_2026, source: "embedded" };
    }

    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
    }) as unknown[][];

    let currentMonth = -1;
    let currentMonthName = "";
    const parsed: Rogitata2026Record[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const c0 = String(r[0] || "")
        .trim()
        .toUpperCase();
      if (MONTHS_MAP[c0] != null) {
        currentMonth = MONTHS_MAP[c0];
        currentMonthName = c0;
        continue;
      }
      const name = parseStr(r[1]);
      if (!name) continue;
      const upName = name.toUpperCase();
      if (["ACQUIRENTE", "CLIENTE"].includes(upName)) continue;
      if (
        upName.startsWith("ANALISI") ||
        r[0]?.toString().includes("°") ||
        upName.includes("POLIZZE") ||
        upName.includes("% CLIENTE")
      ) {
        continue;
      }

      const phone = parseStr(r[2]);
      const loanAmount = parseNum(r[3]);
      const propertyAmount = parseNum(r[4]);
      let ltvPercent = parseNum(r[5]);
      if (ltvPercent != null && ltvPercent > 1) ltvPercent = ltvPercent / 100;
      const provenance = parseStr(r[6]);
      const bankName = parseStr(r[7]);
      const notaryName = parseStr(r[8]);
      const appraiserName = parseStr(r[9]);
      const commissionPolicy = parseNum(r[10]);
      const commissionCqs = parseNum(r[11]);
      const commissionBank = parseNum(r[12]);
      const commissionClient = parseNum(r[13]);
      const commissionLoans = parseNum(r[14]);
      const commissionNotary = parseNum(r[15]);

      let operationType = "MUTUO";
      if (!loanAmount && commissionCqs) operationType = "CQS";
      else if (!loanAmount && commissionLoans) operationType = "PRESTITO";
      else if (loanAmount && commissionCqs) operationType = "MUTUO+CQS";

      if (
        !loanAmount &&
        !propertyAmount &&
        !commissionClient &&
        !commissionBank &&
        !commissionPolicy &&
        !commissionCqs &&
        !commissionLoans
      ) {
        continue;
      }

      const safeMonth = currentMonth >= 0 ? currentMonth : 1;
      const rogitoAt = new Date(Date.UTC(2026, safeMonth, 15, 12, 0, 0));

      parsed.push({
        clientName: name.toUpperCase(),
        phone,
        loanAmount,
        propertyAmount,
        ltvPercent,
        provenance,
        bankName,
        notaryName,
        appraiserName,
        commissionPolicy,
        commissionCqs,
        commissionBank,
        commissionClient,
        commissionLoans,
        commissionNotary,
        operationType,
        month: currentMonthName || "2026",
        rogitoAt: rogitoAt.toISOString(),
      });
    }

    if (parsed.length > 0) {
      return { records: parsed, source: "live_sheet" };
    }
    return { records: EMBEDDED_ROGITATE_2026, source: "embedded" };
  } catch (err) {
    console.error("Error reading live sheet, using embedded 2026 data:", err);
    return { records: EMBEDDED_ROGITATE_2026, source: "embedded" };
  }
}
