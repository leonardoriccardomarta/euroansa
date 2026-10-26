import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { google, type Auth } from "googleapis";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, ilike, and, or, isNotNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { DocumentType } from "@/db/schema";

export type TargetClient = {
  name: string; // Nome anagrafica cliente assegnato nel database
  driveFolderName: string; // Nome reale verificato della cartella in Google Drive
  brokerName: string;
  aliases?: string[];
};

// 1. Root Folder IDs corretti (Marco: 1dw..., Filippo: 1dZ...)
export const MARCO_ROOT_FOLDER_ID = "1dwKvAptJyET7TOhbY17TTdl4qDoYKt4C";
export const FILIPPO_ROOT_FOLDER_ID = "1dZ_6u87UZznozfXttG7mLZg7H-HRcfFg";

// Cartelle escluse esplicitamente o già presenti/elaborate
export const EXCLUDED_FOLDER_NAMES: string[] = [
  "XEKA",
  "FLAVIO RIVA",
  "AHMED SALEM",
  "HANY HELAL",
  "MOHAMED BUZILI",
  "SINKA",
  "RICCARDO GATTER",
  "CARMELO PARETE",
];

// Target Marco (esattamente 3 pratiche)
export const MARCO_TARGETS: TargetClient[] = [
  {
    name: "AMR KHATTAB",
    driveFolderName: "KHATTAB AMR-2",
    brokerName: "Marco Gorla",
    aliases: ["AMR", "KHATTAB AMR", "KHATTAB AMR-2", "AMR KHATTAB"],
  },
  {
    name: "HANY ALI ABDALLA",
    driveFolderName: "ALI ABDALLA HANY-1",
    brokerName: "Marco Gorla",
    aliases: [
      "ALI ABDALLA HANY",
      "ALI ABDALLA",
      "HANY",
      "ALI ABDALLA HANY-1",
      "HANY ALI ABDALLA",
      "ALI ABDOLLA HAFY",
    ],
  },
  {
    name: "NASIR",
    driveFolderName: "NASIR-3",
    brokerName: "Marco Gorla",
    aliases: ["NASIR-3", "NASIR"],
  },
];

// Target Filippo (esattamente 12 pratiche)
export const FILIPPO_TARGETS: TargetClient[] = [
  {
    name: "ABBADI",
    driveFolderName: "ABBADI",
    brokerName: "Filippo Carriero",
    aliases: ["ABBADI"],
  },
  {
    name: "BADAR FARAG KAMAL",
    driveFolderName: "BADAR FARAG KAMAL",
    brokerName: "Filippo Carriero",
    aliases: [
      "BADAR FARAG",
      "GADAL FARAG KAMAL",
      "BADAL FARAG KAMAL",
      "BADAR",
      "FARAG",
      "KAMAL",
    ],
  },
  {
    name: "BUTT ABDUL",
    driveFolderName: "BUTT ABDUL",
    brokerName: "Filippo Carriero",
    aliases: ["BUTT ABDUL", "BIST ABDUL HADI", "BUTT", "ABDUL"],
  },
  {
    name: "CHELEMBEN JHURRY",
    driveFolderName: "CHELEMBEN - JHURRY",
    brokerName: "Filippo Carriero",
    aliases: [
      "CHELEMBEN",
      "JHURRY",
      "CHELEMBEN - JHURRY",
      "CHELEMBEN JHURRY",
      "OUISSEM SHUKRY",
    ],
  },
  {
    name: "CHERKAOUI GUENNANI",
    driveFolderName: "CHERKAOUI GUENNANI",
    brokerName: "Filippo Carriero",
    aliases: ["CHERKAOUI", "GUENNANI", "CHERKAOUI GUENNANI"],
  },
  {
    name: "DALIPAJ OLGERT",
    driveFolderName: "DALIPAJ OLGERT",
    brokerName: "Filippo Carriero",
    aliases: ["DALIPAJ", "OLGERT", "DALIPAJ OLGERT", "OLTEO ESSA"],
  },
  {
    name: "ESLAM AHMED",
    driveFolderName: "ESLAM AHMED-PRATICA KIRON",
    brokerName: "Filippo Carriero",
    aliases: ["ESLAM AHMED", "ESLAM AHMED-PRATICA KIRON", "ESLAM"],
  },
  {
    name: "CARLOS MAGGIONI",
    driveFolderName: "MAGGIONI/KIRLOS-PRATICA KIRON DA SPOESTARE EUROANSA",
    brokerName: "Filippo Carriero",
    aliases: [
      "MAGGIONI",
      "KIRLOS",
      "CARLOS MAGGIONI",
      "MAGGIONI/KIRLOS",
      "MAGGIONI KIRLOS",
    ],
  },
  {
    name: "MIA MUNNA",
    driveFolderName: "MIA MUNNA",
    brokerName: "Filippo Carriero",
    aliases: ["MIA MUNNA", "MIA MUTTA", "MUNNA"],
  },
  {
    name: "MOHAMED ALI",
    driveFolderName: "MOHAMED ALI",
    brokerName: "Filippo Carriero",
    aliases: ["MOHAMED ALI"],
  },
  {
    name: "SIMEONE PASQUALE",
    driveFolderName: "SIMEONE PASQUALE",
    brokerName: "Filippo Carriero",
    aliases: ["SIMEONE PASQUALE", "SIMONE PASQUALE", "SIMEONE", "PASQUALE"],
  },
  {
    name: "WALID BAKHIT HANNA",
    driveFolderName: "WALID BAKHIT HANNA",
    brokerName: "Filippo Carriero",
    aliases: ["WALID BAKHIT HANNA", "WALID", "BAKHIT", "HANNA"],
  },
];

const CLIENT_SURNAME_MAP: Record<string, string> = {
  "AMR KHATTAB": "KHATTAB",
  "HANY ALI ABDALLA": "ABDALLA",
  "NASIR": "NASIR",
  "ABBADI": "ABBADI",
  "BADAR FARAG KAMAL": "BADAR",
  "BUTT ABDUL": "BUTT",
  "CHELEMBEN JHURRY": "CHELEMBEN",
  "CHERKAOUI GUENNANI": "CHERKAOUI",
  "DALIPAJ OLGERT": "DALIPAJ",
  "ESLAM AHMED": "ESLAM",
  "CARLOS MAGGIONI": "MAGGIONI",
  "MIA MUNNA": "MIA",
  "MOHAMED ALI": "MOHAMED",
  "SIMEONE PASQUALE": "SIMEONE",
  "WALID BAKHIT HANNA": "WALID",
};

export function getClientSurname(clientName?: string): string {
  if (!clientName) return "CLIENTE";
  const norm = clientName.trim().toUpperCase();
  if (CLIENT_SURNAME_MAP[norm]) return CLIENT_SURNAME_MAP[norm];
  for (const [k, v] of Object.entries(CLIENT_SURNAME_MAP)) {
    if (norm.includes(k) || k.includes(norm)) return v;
  }
  const tokens = norm.split(/\s+/).filter(Boolean);
  return tokens[0] || "CLIENTE";
}

export function normalizeString(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pulisce etichette trailing, numerazioni (-1, -2, -3) e tag Kiron per matching fuzzy tollerante */
export function cleanFolderNameForMatch(folderName: string): string {
  return folderName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[-_/\\]?\s*PRATICA\s+KIRON.*$/i, "")
    .replace(/[-_/\\]\s*\d+\s*$/, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function stringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  return Math.max(0, 1 - levenshteinDistance(s1, s2) / maxLen);
}

export type FuzzyMatchResult = {
  matched: boolean;
  score: number;
  reason: string;
};

export function matchTargetClient(
  folderName: string,
  target: TargetClient,
): FuzzyMatchResult {
  const normCandidate = normalizeString(folderName);

  // Controllo esclusioni esplicite
  for (const excl of EXCLUDED_FOLDER_NAMES) {
    if (normCandidate === normalizeString(excl)) {
      return {
        matched: false,
        score: 0,
        reason: `Cartella esclusa esplicitamente (${excl})`,
      };
    }
  }

  const normTargetDrive = normalizeString(target.driveFolderName);
  const normTargetName = normalizeString(target.name);
  const cleanCandidate = cleanFolderNameForMatch(folderName);
  const cleanTargetDrive = cleanFolderNameForMatch(target.driveFolderName);
  const cleanTargetName = cleanFolderNameForMatch(target.name);

  // 1. Corrispondenza esatta con il nome reale Drive o anagrafica
  if (normCandidate === normTargetDrive || normCandidate === normTargetName) {
    return {
      matched: true,
      score: 1.0,
      reason: `Corrispondenza esatta con cartella Drive (${target.driveFolderName})`,
    };
  }

  // 2. Corrispondenza senza suffissi/numerazione (es. KHATTAB AMR-2 -> KHATTAB AMR)
  if (cleanCandidate === cleanTargetDrive) {
    return {
      matched: true,
      score: 0.98,
      reason: `Corrispondenza esatta senza suffissi (${target.driveFolderName})`,
    };
  }

  // 3. Corrispondenza con nome anagrafica assegnato
  if (cleanCandidate === cleanTargetName) {
    return {
      matched: true,
      score: 0.97,
      reason: `Corrispondenza esatta con anagrafica cliente (${target.name})`,
    };
  }

  const candidateTokens = cleanCandidate.split(" ").filter((t) => t.length > 0);
  const targetDriveTokens = cleanTargetDrive
    .split(" ")
    .filter((t) => t.length > 0);
  const targetNameTokens = cleanTargetName
    .split(" ")
    .filter((t) => t.length > 0);

  // 4. Tutti i token principali del target Drive sono presenti nel candidato
  const allDriveTokensFound =
    targetDriveTokens.length > 0 &&
    targetDriveTokens.every((tt) => candidateTokens.includes(tt));
  if (allDriveTokensFound) {
    return {
      matched: true,
      score: 0.96,
      reason: `Tutti i token (${targetDriveTokens.join(", ")}) presenti nella cartella`,
    };
  }

  // 5. Tutti i token principali del nome assegnato sono presenti nel candidato
  const allNameTokensFound =
    targetNameTokens.length > 0 &&
    targetNameTokens.every((tt) => candidateTokens.includes(tt));
  if (allNameTokensFound) {
    return {
      matched: true,
      score: 0.95,
      reason: `Tutti i token anagrafica (${targetNameTokens.join(", ")}) presenti nella cartella`,
    };
  }

  // 6. Token invertiti o parziali corrispondenti (es. AMR KHATTAB ↔ KHATTAB AMR)
  const allCandidateInTarget =
    candidateTokens.length >= 2 &&
    (candidateTokens.every((ct) => targetDriveTokens.includes(ct)) ||
      candidateTokens.every((ct) => targetNameTokens.includes(ct)));
  if (allCandidateInTarget) {
    return {
      matched: true,
      score: 0.94,
      reason: `Token invertiti corrispondenti a (${target.name})`,
    };
  }

  // 7. Match su Alias / Variazioni storiche
  if (target.aliases && target.aliases.length > 0) {
    for (const alias of target.aliases) {
      const normAlias = cleanFolderNameForMatch(alias);
      if (cleanCandidate === normAlias) {
        return {
          matched: true,
          score: 0.95,
          reason: `Corrispondenza con variazione nota (${alias})`,
        };
      }
      const aliasTokens = normAlias.split(" ").filter((t) => t.length > 0);
      if (
        aliasTokens.length > 0 &&
        aliasTokens.every((at) => candidateTokens.includes(at))
      ) {
        return {
          matched: true,
          score: 0.92,
          reason: `Token della variazione (${alias}) trovati nella cartella`,
        };
      }
      if (cleanCandidate.includes(normAlias)) {
        return {
          matched: true,
          score: 0.9,
          reason: `Sottostringa della variazione (${alias}) trovata nella cartella`,
        };
      }
    }
  }

  // 8. Contenimento sottostringa (es. NASIR-3 contiene NASIR)
  if (
    cleanCandidate.includes(cleanTargetDrive) ||
    cleanCandidate.includes(cleanTargetName)
  ) {
    return {
      matched: true,
      score: 0.9,
      reason: `Nome target contenuto come sottostringa nella cartella`,
    };
  }

  // 9. Similarità complessiva di Levenshtein
  const fullSimDrive = stringSimilarity(cleanCandidate, cleanTargetDrive);
  const fullSimName = stringSimilarity(cleanCandidate, cleanTargetName);
  const bestSim = Math.max(fullSimDrive, fullSimName);

  if (bestSim >= 0.8) {
    return {
      matched: true,
      score: Number(bestSim.toFixed(2)),
      reason: `Similarità Levenshtein ${Math.round(bestSim * 100)}% (soglia >= 80%)`,
    };
  }

  return {
    matched: false,
    score: Number(bestSim.toFixed(2)),
    reason: "Nessuna corrispondenza valida",
  };
}

export type DocCategory = "CLIENT" | "IMMOBILE" | "EUROANSA" | "BANCA";

export type InferredDocClassification = {
  category: DocCategory;
  /** Tipo descrittivo visualizzato in UI (es. VISURA_CATASTALE, PLANIMETRIA, MODELLO_CU, BANCA_DDM) */
  type: string;
  /** Tipo compatibile con enum PostgreSQL document_type */
  dbType: DocumentType;
  subfolder: string;
  standardizedName: string;
};

/**
 * Gestione collisioni: se un file standardizzato esiste già nella pratica, appende _1, _2
 */
export function resolveCollision(
  intendedName: string,
  existingNames: Set<string>,
): string {
  if (!existingNames.has(intendedName)) {
    existingNames.add(intendedName);
    return intendedName;
  }
  const extIdx = intendedName.lastIndexOf(".");
  const base = extIdx > 0 ? intendedName.slice(0, extIdx) : intendedName;
  const ext = extIdx > 0 ? intendedName.slice(extIdx) : "";

  let counter = 1;
  let candidate = `${base}_${counter}${ext}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${base}_${counter}${ext}`;
  }
  existingNames.add(candidate);
  return candidate;
}

/**
 * Classificazione deterministica ed eliminazione totale di "SCONOSCIUTO".
 * Applica le regole ufficiali del progetto buildStandardizedFileName via regex/euristiche.
 */
export function classifyDocumentByName(
  fileName: string,
  parentFolder?: string,
  clientName?: string,
): InferredDocClassification {
  const ext = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf("."))
    : ".pdf";
  const safeExt = ext.toLowerCase() === ".pdf" ? ".pdf" : ext;
  const surname = getClientSurname(clientName);

  const baseName = fileName.replace(/\.[^/.]+$/, "");
  const norm = baseName
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parentNorm = (parentFolder || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .trim();

  // Helper per estrarre subunit catastale (CANTINA, BOX, ABITAZIONE, TERRENO, SUB...)
  const subunitMatch = norm.match(
    /\b(CANTINA|BOX|ABITAZIONE|TERRENO|SUB\s*\d*|APPARTAMENTO|GARAGE)\b/,
  );
  const subunit = subunitMatch ? subunitMatch[0].replace(/\s+/g, "_") : "";

  // Helper per estrarre nome banca noto
  const bankMatch = norm.match(
    /\b(UNICREDIT|INTESA|BPER|POSTE|CREDIT\s*AGRICOLE|CREDITAGRICOLE|BPM|BBVA|ING|FINECO|CHEBANCA|MEDIOLANUM)\b/,
  );
  const bank = bankMatch ? bankMatch[0].replace(/\s+/g, "") : "";

  // Helper per dettagli busta paga (date/mesi/numeri)
  const bpMatch = norm.match(
    /\b(\d{2}[_\s]\d{2}[_\s]\d{2}|\d{2}[_\s]\d{2}|\d{2}|\d{1}|GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)\b/,
  );
  const bpDetail = bpMatch ? bpMatch[0].replace(/\s+/g, "_") : "";

  // Helper per periodo estratto conto
  const ecPeriodMatch = norm.match(/\b(\d{1,2}\s*MESI|\d{4})\b/);
  const ecPeriod = ecPeriodMatch ? ecPeriodMatch[0].replace(/\s+/g, "_") : "";

  // ==========================================
  // A. IMMOBILE
  // ==========================================
  // CAT_ o CATASTALE -> VISURA_CATASTALE
  if (
    /\b(CAT|CATASTALE|VISURA\s*CATASTALE)\b/.test(norm) ||
    (norm.includes("CAT") && !norm.includes("CONTRATTO"))
  ) {
    const detailPart = subunit ? `_${subunit}` : "";
    return {
      category: "IMMOBILE",
      type: "VISURA_CATASTALE",
      dbType: "SCHEDE_CATASTALI",
      subfolder: "IMMOBILE",
      standardizedName: `${surname}_Visura_Catastale${detailPart}${safeExt}`,
    };
  }

  // PLN_ o PLANIMETRIA -> PLANIMETRIA
  if (/\b(PLN|PLANIMETRIA)\b/.test(norm) || norm.includes("PLN")) {
    const detailPart = subunit ? `_${subunit}` : "";
    return {
      category: "IMMOBILE",
      type: "PLANIMETRIA",
      dbType: "SCHEDE_CATASTALI",
      subfolder: "IMMOBILE",
      standardizedName: `${surname}_Planimetria${detailPart}${safeExt}`,
    };
  }

  // APE o ATTESTATO PRESTAZIONE ENERGETICA -> APE
  if (/\b(APE|ATTESTATO\s*PRESTAZIONE\s*ENERGETICA)\b/.test(norm)) {
    return {
      category: "IMMOBILE",
      type: "APE",
      dbType: "APE",
      subfolder: "IMMOBILE",
      standardizedName: `${surname}_APE${safeExt}`,
    };
  }

  // ATTO o COMPRAVENDITA o PROVENIENZA -> ATTO_PROVENIENZA
  if (/\b(ATTO|COMPRAVENDITA|PROVENIENZA)\b/.test(norm)) {
    return {
      category: "IMMOBILE",
      type: "ATTO_PROVENIENZA",
      dbType: "ATTO_IMMOBILE",
      subfolder: "IMMOBILE",
      standardizedName: `${surname}_Atto_Provenienza${safeExt}`,
    };
  }

  // PRELIMINARE o PROPOSTA o COMPROMESSO -> PRELIMINARE_COMPRAVENDITA
  if (/\b(PRELIMINARE|PROPOSTA|COMPROMESSO)\b/.test(norm)) {
    return {
      category: "IMMOBILE",
      type: "PRELIMINARE_COMPRAVENDITA",
      dbType: "PRELIMINARE_COMPRAVENDITA",
      subfolder: "IMMOBILE",
      standardizedName: `${surname}_Preliminare_Compravendita${safeExt}`,
    };
  }

  // ==========================================
  // B. CLIENT
  // ==========================================
  // CUD o CU seguito da cifre (cud26, cu26, cu2026...) o CUD generico -> MODELLO_CU
  if (/\b(CUD|CU)\d*\b/.test(norm) || /\b(CUD\d+|CU\d+)\b/.test(baseName.toUpperCase())) {
    return {
      category: "CLIENT",
      type: "MODELLO_CU",
      dbType: "MODELLO_CUD",
      subfolder: `${surname} DOC`,
      standardizedName: `${surname}_Modello_CU_2026${safeExt}`,
    };
  }

  // 730 o UNICO o MODELLO REDDITI -> DICHIARAZIONE_REDDITI
  if (/\b(730|UNICO|MODELLO\s*REDDITI|REDDITI)\b/.test(norm)) {
    return {
      category: "CLIENT",
      type: "DICHIARAZIONE_REDDITI",
      dbType: "MODELLO_730",
      subfolder: `${surname} DOC`,
      standardizedName: `${surname}_Dichiarazione_Redditi${safeExt}`,
    };
  }

  // BP o BUSTA o BUSTEPAGA o CEDOLINO -> BUSTA_PAGA
  if (/\b(BP|BUSTA|BUSTEPAGA|CEDOLINO)\b/.test(norm)) {
    const detailPart = bpDetail ? `_${bpDetail}` : "";
    return {
      category: "CLIENT",
      type: "BUSTA_PAGA",
      dbType: "BUSTA_PAGA_1",
      subfolder: `${surname} DOC`,
      standardizedName: `${surname}_BustaPaga${detailPart}${safeExt}`,
    };
  }

  // EC o ESTRATTO o MOVIMENTI o SALDO -> ESTRATTO_CONTO
  if (/\b(EC|ESTRATTO|MOVIMENTI|SALDO)\b/.test(norm)) {
    let detail = "";
    if (bank && ecPeriod) detail = `_${bank}_${ecPeriod}`;
    else if (bank) detail = `_${bank}`;
    else if (ecPeriod) detail = `_${ecPeriod}`;
    return {
      category: "CLIENT",
      type: "ESTRATTO_CONTO",
      dbType: "ESTRATTO_CONTO",
      subfolder: `${surname} DOC`,
      standardizedName: `${surname}_EC${detail}${safeExt}`,
    };
  }

  // TS o TESSERA SANITARIA o CODICE FISCALE o CF -> TESSERA_SANITARIA
  if (/\b(TS|TESSERA\s*SANITARIA|CODICE\s*FISCALE|CF)\b/.test(norm)) {
    return {
      category: "CLIENT",
      type: "TESSERA_SANITARIA",
      dbType: "TESSERA_SANITARIA",
      subfolder: `${surname} DOC`,
      standardizedName: `${surname}_TesseraSanitaria${safeExt}`,
    };
  }

  // CI o CARTA IDENTITA o DOCUMENTO o PDS o PERMESSO o PASSAPORTO -> CARTA_IDENTITA
  if (
    /\b(CI|CARTA\s*IDENTITA|DOCUMENTO|PDS|PERMESSO|PERMESSO\s*SOGGIORNO|PASSAPORTO)\b/.test(
      norm,
    )
  ) {
    return {
      category: "CLIENT",
      type: "CARTA_IDENTITA",
      dbType: "CARTA_IDENTITA",
      subfolder: `${surname} DOC`,
      standardizedName: `${surname}_CartaIdentita${safeExt}`,
    };
  }

  // CUMULATIVO o STATO FAMIGLIA o RESIDENZA o ANAGRAFICO o CERTIFICATO -> CERTIFICATO_ANAGRAFICO
  if (
    /\b(CUMULATIVO|STATO\s*FAMIGLIA|RESIDENZA|ANAGRAFICO|CERTIFICATO)\b/.test(
      norm,
    )
  ) {
    return {
      category: "CLIENT",
      type: "CERTIFICATO_ANAGRAFICO",
      dbType: "STATO_FAMIGLIA",
      subfolder: `${surname} DOC`,
      standardizedName: `${surname}_Certificato_Cumulativo${safeExt}`,
    };
  }

  // ==========================================
  // C. BANCA & EUROANSA
  // ==========================================
  // DDM -> BANCA_DDM
  if (/\bDDM\b/.test(norm)) {
    return {
      category: "BANCA",
      type: "BANCA_DDM",
      dbType: "ESTRATTO_CONTO",
      subfolder: "BANCA",
      standardizedName: `${surname}_BANCA_DDM${safeExt}`,
    };
  }

  // PIES -> BANCA_PIES
  if (/\bPIES\b/.test(norm)) {
    return {
      category: "BANCA",
      type: "BANCA_PIES",
      dbType: "ESTRATTO_CONTO",
      subfolder: "BANCA",
      standardizedName: `${surname}_BANCA_PIES${safeExt}`,
    };
  }

  // RICHIESTA o MODULO BANCA o DELIBERA -> RICHIESTA_MUTUO_FIRMATA
  if (
    /\b(RICHIESTA|MODULO\s*BANCA|DELIBERA|MUTUO|CONTRATTO\s*MUTUO)\b/.test(norm) &&
    (/BANCA/i.test(parentNorm) || /BANCA/i.test(norm))
  ) {
    return {
      category: "BANCA",
      type: "RICHIESTA_MUTUO_FIRMATA",
      dbType: "ESTRATTO_CONTO",
      subfolder: "BANCA",
      standardizedName: `${surname}_BANCA_Richiesta_Mutuo${safeExt}`,
    };
  }

  // CONSEGNA o ATTESTATO DI CONSEGNA -> CONSEGNA_DOCUMENTI
  if (/\b(CONSEGNA|ATTESTATO\s*DI\s*CONSEGNA)\b/.test(norm)) {
    return {
      category: "EUROANSA",
      type: "CONSEGNA_DOCUMENTI",
      dbType: "CONTRATTO_LAVORO",
      subfolder: "EUROANSA",
      standardizedName: `${surname}_Euroansa_Attestato_Consegna${safeExt}`,
    };
  }

  // YOUDOMUS o ADEGUATA VERIFICA o AVC o LAR -> ADEGUATA_VERIFICA
  if (/\b(YOUDOMUS|ADEGUATA\s*VERIFICA|AVC|LAR)\b/.test(norm)) {
    return {
      category: "EUROANSA",
      type: "ADEGUATA_VERIFICA",
      dbType: "CARTA_IDENTITA",
      subfolder: "EUROANSA",
      standardizedName: `${surname}_Euroansa_Adeguata_Verifica${safeExt}`,
    };
  }

  // PRIVACY o ALLEGATO 1 o PRIV -> PRIVACY
  if (/\b(PRIVACY|ALLEGATO\s*1|PRIV)\b/.test(norm)) {
    return {
      category: "EUROANSA",
      type: "PRIVACY",
      dbType: "CARTA_IDENTITA",
      subfolder: "EUROANSA",
      standardizedName: `${surname}_Euroansa_Allegato_1_Privacy${safeExt}`,
    };
  }

  // CONTRATTO o MEDIAZIONE o CMCC -> CONTRATTO_MEDIAZIONE
  if (/\b(CONTRATTO|MEDIAZIONE|CMCC)\b/.test(norm)) {
    return {
      category: "EUROANSA",
      type: "CONTRATTO_MEDIAZIONE",
      dbType: "CONTRATTO_LAVORO",
      subfolder: "EUROANSA",
      standardizedName: `${surname}_Euroansa_Contratto_Mediazione${safeExt}`,
    };
  }

  // RELAZIONE o DATI PRATICA -> RELAZIONE_MUTUO
  if (/\b(RELAZIONE|DATI\s*PRATICA)\b/.test(norm)) {
    return {
      category: "EUROANSA",
      type: "RELAZIONE_MUTUO",
      dbType: "ESTRATTO_CONTO",
      subfolder: "EUROANSA",
      standardizedName: `${surname}_Euroansa_Relazione_Mutuo${safeExt}`,
    };
  }

  // ==========================================
  // D. STRICT FALLBACK - NEVER "SCONOSCIUTO"
  // ==========================================
  const cleanOriginal =
    baseName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "File";

  if (/IMMOBIL/i.test(parentNorm)) {
    return {
      category: "IMMOBILE",
      type: "DOCUMENTO_IMMOBILE",
      dbType: "ATTO_IMMOBILE",
      subfolder: "IMMOBILE",
      standardizedName: `${surname}_Documento_Immobile_${cleanOriginal}${safeExt}`,
    };
  }
  if (/EUROANSA/i.test(parentNorm)) {
    return {
      category: "EUROANSA",
      type: "DOCUMENTO_EUROANSA",
      dbType: "CONTRATTO_LAVORO",
      subfolder: "EUROANSA",
      standardizedName: `${surname}_Euroansa_${cleanOriginal}${safeExt}`,
    };
  }
  if (/BANCA/i.test(parentNorm)) {
    return {
      category: "BANCA",
      type: "DOCUMENTO_BANCA",
      dbType: "ESTRATTO_CONTO",
      subfolder: "BANCA",
      standardizedName: `${surname}_BANCA_${cleanOriginal}${safeExt}`,
    };
  }

  return {
    category: "CLIENT",
    type: "DOCUMENTO_CLIENTE",
    dbType: "CARTA_IDENTITA",
    subfolder: `${surname} DOC`,
    standardizedName: `${surname}_Documento_${cleanOriginal}${safeExt}`,
  };
}

export type MigrationPracticeDetail = {
  target: string;
  driveFolderName: string;
  broker: string;
  matchedFolder?: string;
  driveFolderId?: string;
  score?: number;
  reason?: string;
  filesCount: number;
  files: {
    name: string;
    category: string;
    type: string;
    subfolder: string;
    standardizedName: string;
    size?: number;
  }[];
};

export type MigrationExecutionResult = {
  ok: boolean;
  dryRun: boolean;
  matchedPractices: number;
  totalPractices: number;
  filesDiscovered: number;
  filesImported: number;
  filesSkipped: number;
  details: MigrationPracticeDetail[];
  error?: string;
};

export async function executeDriveMigration(options: {
  dryRun: boolean;
}): Promise<MigrationExecutionResult> {
  const isDryRun = options.dryRun;

  // 1. Google OAuth
  let auth: Auth.OAuth2Client | null = null;
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

  if (clientId && clientSecret && refreshToken) {
    auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
  } else if (process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const dbInstance = drizzle(sql, { schema });
      const [u] = await dbInstance
        .select({ token: schema.users.googleRefreshToken })
        .from(schema.users)
        .where(isNotNull(schema.users.googleRefreshToken))
        .limit(1);

      if (u?.token && clientId && clientSecret) {
        auth = new google.auth.OAuth2(clientId, clientSecret);
        auth.setCredentials({ refresh_token: u.token });
      }
    } catch {
      // ignore
    }
  }

  if (!auth) {
    return {
      ok: false,
      dryRun: isDryRun,
      matchedPractices: 0,
      totalPractices: MARCO_TARGETS.length + FILIPPO_TARGETS.length,
      filesDiscovered: 0,
      filesImported: 0,
      filesSkipped: 0,
      details: [],
      error:
        "Credenziali Google Drive non collegate. Collega la mail ufficio da Impostazioni.",
    };
  }

  const drive = google.drive({ version: "v3", auth });

  // 2. Database e R2 se Live
  let db: ReturnType<typeof drizzle> | null = null;
  let r2: { client: S3Client; bucket: string } | null = null;

  if (!isDryRun) {
    if (!process.env.DATABASE_URL) {
      return {
        ok: false,
        dryRun: false,
        matchedPractices: 0,
        totalPractices: MARCO_TARGETS.length + FILIPPO_TARGETS.length,
        filesDiscovered: 0,
        filesImported: 0,
        filesSkipped: 0,
        details: [],
        error: "DATABASE_URL mancante",
      };
    }
    const sql = neon(process.env.DATABASE_URL);
    db = drizzle(sql, { schema });

    const endpoint =
      process.env.R2_ENDPOINT?.trim() ||
      (process.env.R2_ACCOUNT_ID?.trim()
        ? `https://${process.env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
        : "");
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
    const bucket = process.env.R2_BUCKET_NAME?.trim() || "euroansa";

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      return {
        ok: false,
        dryRun: false,
        matchedPractices: 0,
        totalPractices: MARCO_TARGETS.length + FILIPPO_TARGETS.length,
        filesDiscovered: 0,
        filesImported: 0,
        filesSkipped: 0,
        details: [],
        error: "Credenziali Cloudflare R2 mancanti",
      };
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    r2 = { client: s3, bucket };
  }

  // Broker caching
  const brokerIdMap: Record<string, string | null> = {};
  if (db) {
    try {
      const allUsers = await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users);
      for (const u of allUsers) {
        if (/Marco/i.test(u.name)) brokerIdMap["Marco Gorla"] = u.id;
        if (/Filipp/i.test(u.name)) brokerIdMap["Filippo Carriero"] = u.id;
      }
    } catch {
      // ignore
    }
  }

  const sections = [
    {
      broker: "Marco Gorla",
      folderId: MARCO_ROOT_FOLDER_ID,
      targets: MARCO_TARGETS,
    },
    {
      broker: "Filippo Carriero",
      folderId: FILIPPO_ROOT_FOLDER_ID,
      targets: FILIPPO_TARGETS,
    },
  ];

  let totalPracticesMatched = 0;
  let totalFilesDiscovered = 0;
  let totalFilesImported = 0;
  let totalFilesSkipped = 0;
  const details: MigrationPracticeDetail[] = [];

  for (const sec of sections) {
    const childFolders: { id: string; name: string }[] = [];
    try {
      let pageToken: string | undefined;
      do {
        const page = await drive.files.list({
          q: `'${sec.folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
          fields: "nextPageToken, files(id, name)",
          pageSize: 100,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        for (const f of page.data.files ?? []) {
          if (f.id && f.name) childFolders.push({ id: f.id, name: f.name });
        }
        pageToken = page.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (err) {
      console.error(`Errore accesso cartella ${sec.folderId}:`, err);
      continue;
    }

    for (const target of sec.targets) {
      let bestMatch: {
        folder: { id: string; name: string };
        result: FuzzyMatchResult;
      } | null = null;

      for (const f of childFolders) {
        const res = matchTargetClient(f.name, target);
        if (res.matched) {
          if (!bestMatch || res.score > bestMatch.result.score) {
            bestMatch = { folder: f, result: res };
          }
        }
      }

      if (!bestMatch) {
        details.push({
          target: target.name,
          driveFolderName: target.driveFolderName,
          broker: sec.broker,
          filesCount: 0,
          files: [],
        });
        continue;
      }

      totalPracticesMatched++;

      // Scansione file
      const rawFiles: {
        id: string;
        name: string;
        mimeType: string;
        size?: number;
        parentSubfolder?: string;
      }[] = [];

      async function scanFolder(folderId: string, subPath = "") {
        let pageToken: string | undefined;
        do {
          const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: "nextPageToken, files(id, name, mimeType, size)",
            pageSize: 100,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });

          for (const f of res.data.files ?? []) {
            if (!f.id || !f.name) continue;
            if (f.mimeType === "application/vnd.google-apps.folder") {
              const nextSub = subPath ? `${subPath}/${f.name}` : f.name;
              await scanFolder(f.id, nextSub);
            } else {
              rawFiles.push({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType ?? "application/octet-stream",
                size: f.size ? Number(f.size) : undefined,
                parentSubfolder: subPath,
              });
            }
          }
          pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);
      }

      await scanFolder(bestMatch.folder.id);
      totalFilesDiscovered += rawFiles.length;

      // Gestione collisioni per questa pratica
      const practiceFileNames = new Set<string>();

      const classifiedFiles = rawFiles.map((file) => {
        const cls = classifyDocumentByName(
          file.name,
          file.parentSubfolder,
          target.name,
        );
        const resolvedName = resolveCollision(
          cls.standardizedName,
          practiceFileNames,
        );
        return {
          name: file.name,
          category: cls.category,
          type: cls.type,
          dbType: cls.dbType,
          subfolder: cls.subfolder,
          standardizedName: resolvedName,
          size: file.size,
          id: file.id,
          mimeType: file.mimeType,
        };
      });

      details.push({
        target: target.name,
        driveFolderName: target.driveFolderName,
        broker: sec.broker,
        matchedFolder: bestMatch.folder.name,
        driveFolderId: bestMatch.folder.id,
        score: Math.round(bestMatch.result.score * 100),
        reason: bestMatch.result.reason,
        filesCount: classifiedFiles.length,
        files: classifiedFiles.map((f) => ({
          name: f.name,
          category: f.category,
          type: f.type,
          subfolder: f.subfolder,
          standardizedName: f.standardizedName,
          size: f.size,
        })),
      });

      // Esecuzione LIVE
      if (!isDryRun && db && r2) {
        const [existingApp] = await db
          .select()
          .from(schema.applications)
          .where(
            or(
              eq(schema.applications.clientName, target.name),
              ilike(schema.applications.clientName, `%${target.name}%`),
            ),
          )
          .limit(1);

        let applicationId = existingApp?.id;
        const surname = getClientSurname(target.name);
        if (!applicationId) {
          const brokerId = brokerIdMap[sec.broker] ?? null;
          const [createdApp] = await db
            .insert(schema.applications)
            .values({
              clientName: target.name,
              clientEmail: `${normalizeString(target.name).toLowerCase().replace(/\s+/g, ".")}@client.euroansa.it`,
              status: "ROGITATA",
              brokerId: brokerId,
              storageFolders: [
                `${surname} DOC`,
                "IMMOBILE",
                "EUROANSA",
                "BANCA",
              ],
            })
            .returning();
          applicationId = createdApp.id;
        }

        for (const file of classifiedFiles) {
          const [alreadyExists] = await db
            .select({ id: schema.documents.id })
            .from(schema.documents)
            .where(
              and(
                eq(schema.documents.applicationId, applicationId),
                or(
                  eq(schema.documents.rawFileName, file.name),
                  eq(schema.documents.renamedFileName, file.standardizedName),
                  file.size
                    ? and(
                        eq(schema.documents.fileSize, file.size),
                        eq(schema.documents.rawFileName, file.name),
                      )
                    : eq(schema.documents.rawFileName, file.name),
                ),
              ),
            )
            .limit(1);

          if (alreadyExists) {
            totalFilesSkipped++;
            continue;
          }

          let buffer: Buffer;
          try {
            if (file.mimeType.startsWith("application/vnd.google-apps.")) {
              const exp = await drive.files.export(
                { fileId: file.id, mimeType: "application/pdf" },
                { responseType: "arraybuffer" },
              );
              buffer = Buffer.from(exp.data as ArrayBuffer);
            } else {
              const dl = await drive.files.get(
                { fileId: file.id, alt: "media", supportsAllDrives: true },
                { responseType: "arraybuffer" },
              );
              buffer = Buffer.from(dl.data as ArrayBuffer);
            }
          } catch (dlErr) {
            console.error(`Errore download ${file.name}:`, dlErr);
            continue;
          }

          const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
          const safeName = file.standardizedName.replace(/[\\/]+/g, "_");
          const r2Key = `practices/${applicationId}/${file.subfolder}/${safeName}`;

          try {
            await r2.client.send(
              new PutObjectCommand({
                Bucket: r2.bucket,
                Key: r2Key,
                Body: buffer,
                ContentType: file.mimeType || "application/octet-stream",
              }),
            );
          } catch (r2Err) {
            console.error(`Errore upload R2 ${file.name}:`, r2Err);
            continue;
          }

          await db.insert(schema.documents).values({
            applicationId,
            rawFileName: file.name,
            renamedFileName: safeName,
            documentType: file.dbType as DocumentType,
            driveFileId: r2Key,
            driveFileUrl: `/api/files/download`,
            fileSize: buffer.length,
            fileHash,
            storageSubfolder: file.subfolder,
            isValid: true,
            analysisStatus: "done",
            validationIssues: [],
          });

          totalFilesImported++;
        }
      }
    }
  }

  return {
    ok: true,
    dryRun: isDryRun,
    matchedPractices: totalPracticesMatched,
    totalPractices: MARCO_TARGETS.length + FILIPPO_TARGETS.length,
    filesDiscovered: totalFilesDiscovered,
    filesImported: totalFilesImported,
    filesSkipped: totalFilesSkipped,
    details,
  };
}
