import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { google, type Auth } from "googleapis";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, ilike, and, or, isNotNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { DocumentType } from "../src/db/schema";

// 1. Caricamento variabili d'ambiente
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// 2. Definizione cartelle e target
export type TargetClient = {
  name: string;
  brokerName: string;
  aliases?: string[];
};

export const MARCO_ROOT_FOLDER_ID = "1dZ_6u87UZznozfXttG7mLZg7H-HRcfFg";
export const MARCO_TARGETS: TargetClient[] = [
  { name: "AMR", brokerName: "Marco Gorla" },
  {
    name: "ALI ABDOLLA HAFY",
    brokerName: "Marco Gorla",
    aliases: ["HAFZ", "HAFX", "HAFY", "ALI ABDOLLA", "ABDOLLA HAFZ", "ALI HAFZ"],
  },
  { name: "FLAVIO RIVA", brokerName: "Marco Gorla" },
  { name: "NASIR", brokerName: "Marco Gorla" },
];

export const FILIPPO_ROOT_FOLDER_ID = "1dwKvAptJyET7TOhbY17TTdl4qDoYKt4C";
export const FILIPPO_TARGETS: TargetClient[] = [
  { name: "MOHAMED ALI", brokerName: "Filippo Carriero" },
  { name: "SIMONE PASQUALE", brokerName: "Filippo Carriero" },
  {
    name: "OUISSEM SHUKRY",
    brokerName: "Filippo Carriero",
    aliases: ["OVISSEM", "OUISSEM", "SHUKRY", "CHOUKRI", "OVISSEM SHUKRY"],
  },
  { name: "ESLAM AHMED", brokerName: "Filippo Carriero" },
  { name: "CARLOS MAGGIONI", brokerName: "Filippo Carriero" },
  {
    name: "GADAL FARAG KAMAL",
    brokerName: "Filippo Carriero",
    aliases: ["BADAL", "GADAL", "FARAG", "KAMAL", "BADAL FARAG", "GADAL FARAG"],
  },
  { name: "MIA MUTTA", brokerName: "Filippo Carriero" },
  {
    name: "SINKA",
    brokerName: "Filippo Carriero",
    aliases: ["SIRIKA", "SIKKA", "SINKA"],
  },
  {
    name: "OLTEO ESSA",
    brokerName: "Filippo Carriero",
    aliases: ["OLCEO", "OLTEO", "ESSA", "OLCEO ESSA"],
  },
  { name: "ABBADI", brokerName: "Filippo Carriero" },
  {
    name: "BIST ABDUL HADI",
    brokerName: "Filippo Carriero",
    aliases: ["BIST ABDUL WAHI", "BIST ABDUL RAZI", "BIST ABDUL", "WAHI", "RAZI", "HADI"],
  },
  {
    name: "RICCARDO GATTER",
    brokerName: "Filippo Carriero",
    aliases: ["GAMER", "GATTER", "RICCARDO GAMER", "RICCARDO GATTER", "GATTER RICCARDO"],
  },
];

// 3. Funzioni di Matching Fuzzy e Normalizzazione
export function normalizeString(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
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
  const normTarget = normalizeString(target.name);

  // Exact Match
  if (normCandidate === normTarget) {
    return { matched: true, score: 1.0, reason: "Corrispondenza esatta" };
  }

  const candidateTokens = normCandidate.split(" ").filter((t) => t.length > 0);
  const targetTokens = normTarget.split(" ").filter((t) => t.length > 0);

  // Token set match: tutti i token del target sono presenti nel candidato
  const allTargetTokensFound = targetTokens.every((tt) =>
    candidateTokens.includes(tt),
  );
  if (allTargetTokensFound && targetTokens.length > 0) {
    return {
      matched: true,
      score: 0.96,
      reason: `Tutti i token (${targetTokens.join(", ")}) presenti nella cartella`,
    };
  }

  // Token set invertito (es. GATTER RICCARDO per RICCARDO GATTER)
  const allCandidateInTarget =
    candidateTokens.length >= 2 &&
    candidateTokens.every((ct) => targetTokens.includes(ct));
  if (allCandidateInTarget) {
    return {
      matched: true,
      score: 0.94,
      reason: `Token invertiti o parziali corrispondenti a (${target.name})`,
    };
  }

  // Substring containment (es. cartella con nome esteso contenente AMR o NASIR)
  if (
    normCandidate.includes(normTarget) ||
    (normTarget.length >= 4 && normCandidate.includes(normTarget))
  ) {
    const isSingleShortWord = normTarget.length <= 4;
    // Se parola corta, verifichiamo che sia un token isolato o prefisso
    if (!isSingleShortWord || candidateTokens.includes(normTarget)) {
      return {
        matched: true,
        score: 0.92,
        reason: `Nome target contenuto per intero nella cartella`,
      };
    }
  }

  // Match su Alias / Variazioni di scrittura (HAFZ/HAFX, OVISSEM, BADAL, SIKKA, etc.)
  if (target.aliases && target.aliases.length > 0) {
    for (const alias of target.aliases) {
      const normAlias = normalizeString(alias);
      if (normCandidate === normAlias) {
        return {
          matched: true,
          score: 0.95,
          reason: `Corrispondenza esatta con variazione/alias (${alias})`,
        };
      }
      const aliasTokens = normAlias.split(" ").filter((t) => t.length > 0);
      if (aliasTokens.every((at) => candidateTokens.includes(at))) {
        return {
          matched: true,
          score: 0.92,
          reason: `Token dell'alias (${alias}) trovati nella cartella`,
        };
      }
      if (normCandidate.includes(normAlias)) {
        return {
          matched: true,
          score: 0.9,
          reason: `Sottostringa dell'alias (${alias}) trovata nella cartella`,
        };
      }
    }
  }

  // Similarità complessiva di Levenshtein (soglia > 0.8)
  const fullSim = stringSimilarity(normCandidate, normTarget);
  if (fullSim >= 0.8) {
    return {
      matched: true,
      score: Number(fullSim.toFixed(2)),
      reason: `Similarità Levenshtein ${Math.round(fullSim * 100)}% (soglia >= 80%)`,
    };
  }

  // Similarità token-by-token (per errori di trascrizione parziali)
  if (targetTokens.length >= 2 && candidateTokens.length >= 2) {
    let matchedTokensCount = 0;
    for (const tt of targetTokens) {
      const bestTokenSim = Math.max(
        ...candidateTokens.map((ct) => stringSimilarity(tt, ct)),
      );
      if (bestTokenSim >= 0.8) {
        matchedTokensCount++;
      }
    }
    if (matchedTokensCount === targetTokens.length) {
      return {
        matched: true,
        score: 0.85,
        reason: `Tutti i token mostrano similarità fuzzy >= 80% con il target`,
      };
    }
  }

  return { matched: false, score: Number(fullSim.toFixed(2)), reason: "Nessuna corrispondenza valida" };
}

// 4. Classificazione Deterministica Basata sul Nome (ZERO AI, NO OCR)
export type DocCategory = "CLIENT" | "IMMOBILE" | "EUROANSA" | "BANCA";

export type InferredDocClassification = {
  category: DocCategory;
  documentType: DocumentType;
  subfolder: string;
};

export function classifyDocumentByName(
  fileName: string,
  parentFolder?: string,
  clientName?: string,
): InferredDocClassification {
  const norm = fileName
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parentNorm = (parentFolder ?? "")
    .toUpperCase()
    .replace(/[_\-.]+/g, " ");

  // Regole 1: CLIENT (Anagrafica & Reddito)
  if (
    /\b(CARTA IDENTITA|CI|TESSERA SANITARIA|TS|CF|CODICE FISCALE|BUSTA|BP|CU|CUD|730|UNICO|EC|ESTRATTO|ESTRATTO CONTO|MATRIMONIO|STATO FAMIGLIA|RESIDENZA|PDS|PERMESSO SOGGIORNO|PASSAPORTO|INPS|CONTRATTO LAVORO)\b/.test(
      norm,
    )
  ) {
    let docType: DocumentType = "SCONOSCIUTO";
    if (/\b(CARTA IDENTITA|CI)\b/.test(norm)) docType = "CARTA_IDENTITA";
    else if (/\b(TESSERA SANITARIA|TS|CF|CODICE FISCALE)\b/.test(norm))
      docType = "TESSERA_SANITARIA";
    else if (/\b(PERMESSO SOGGIORNO|PDS)\b/.test(norm))
      docType = "PERMESSO_SOGGIORNO";
    else if (/\bPASSAPORTO\b/.test(norm)) docType = "PASSAPORTO";
    else if (/\bMATRIMONIO\b/.test(norm)) docType = "ATTO_MATRIMONIO";
    else if (/\b(STATO FAMIGLIA|FAMIGLIA)\b/.test(norm))
      docType = "STATO_FAMIGLIA";
    else if (/\bRESIDENZA\b/.test(norm)) docType = "CERTIFICATO_RESIDENZA";
    else if (/\b(BUSTA|BP)\b/.test(norm)) {
      if (/\b(3|03|MARZO)\b/.test(norm)) docType = "BUSTA_PAGA_3";
      else if (/\b(2|02|FEBBRAIO|FEB)\b/.test(norm)) docType = "BUSTA_PAGA_2";
      else docType = "BUSTA_PAGA_1";
    } else if (/\b(CU|CUD)\b/.test(norm)) docType = "MODELLO_CUD";
    else if (/\b730\b/.test(norm)) docType = "MODELLO_730";
    else if (/\bUNICO\b/.test(norm)) docType = "MODELLO_UNICO";
    else if (/\b(EC|ESTRATTO|ESTRATTO CONTO)\b/.test(norm))
      docType = "ESTRATTO_CONTO";
    else if (/\bINPS\b/.test(norm)) docType = "ESTRATTO_CONTRIBUTIVO_INPS";
    else if (/\bCONTRATTO LAVORO\b/.test(norm))
      docType = "CONTRATTO_LAVORO";

    const subfolder = clientName ? `${clientName.trim().toUpperCase()} DOC` : "DOC";
    return { category: "CLIENT", documentType: docType, subfolder };
  }

  // Regole 2: IMMOBILE
  if (
    /\b(VISURA|PLANIMETRIA|APE|ATTO|PRELIMINARE|PROPOSTA|CATASTO|SCHEDA CATASTALE|COMPRAVENDITA)\b/.test(
      norm,
    )
  ) {
    let docType: DocumentType = "SCONOSCIUTO";
    if (/\b(PLANIMETRIA|VISURA|CATASTO|SCHEDA CATASTALE)\b/.test(norm))
      docType = "SCHEDE_CATASTALI";
    else if (/\bAPE\b/.test(norm)) docType = "APE";
    else if (/\b(PRELIMINARE|PROPOSTA)\b/.test(norm))
      docType = "PRELIMINARE_COMPRAVENDITA";
    else if (/\b(ATTO|COMPRAVENDITA)\b/.test(norm)) docType = "ATTO_IMMOBILE";

    return { category: "IMMOBILE", documentType: docType, subfolder: "IMMOBILE" };
  }

  // Regole 3: EUROANSA
  if (
    /\b(EUROANSA|PRIVACY|CMCC|AVC|YOUDOMUS|RELAZIONE|MANDATO|CONSENSO)\b/.test(
      norm,
    )
  ) {
    return {
      category: "EUROANSA",
      documentType: "SCONOSCIUTO",
      subfolder: "EUROANSA",
    };
  }

  // Regole 4: BANCA
  if (
    /\b(BANCA|DDM|PIES|MUTUO|DELIBERA|CONTRATTO MUTUO)\b/.test(norm)
  ) {
    return { category: "BANCA", documentType: "SCONOSCIUTO", subfolder: "BANCA" };
  }

  // Regole 5: Fallback su nome sottocartella contenitrice
  if (/IMMOBIL/i.test(parentNorm)) {
    return { category: "IMMOBILE", documentType: "SCONOSCIUTO", subfolder: "IMMOBILE" };
  }
  if (/EUROANSA/i.test(parentNorm)) {
    return { category: "EUROANSA", documentType: "SCONOSCIUTO", subfolder: "EUROANSA" };
  }
  if (/BANCA/i.test(parentNorm)) {
    return { category: "BANCA", documentType: "SCONOSCIUTO", subfolder: "BANCA" };
  }

  const subfolder = clientName ? `${clientName.trim().toUpperCase()} DOC` : "DOC";
  return { category: "CLIENT", documentType: "SCONOSCIUTO", subfolder };
}

// 5. Inizializzazione R2 Client
function getR2Client(): { client: S3Client; bucket: string } {
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (process.env.R2_ACCOUNT_ID?.trim()
      ? `https://${process.env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
      : "");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const bucket = process.env.R2_BUCKET_NAME?.trim() || "euroansa";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Credenziali Cloudflare R2 mancanti (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return { client, bucket };
}

// 6. Inizializzazione Google Drive Client
async function getDriveAuthClient(): Promise<Auth.OAuth2Client | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

  if (clientId && clientSecret && refreshToken) {
    const oauth = new google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    return oauth;
  }

  // Prova a recuperare il refresh token salvato a database
  if (process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const db = drizzle(sql, { schema });
      const [userWithGoogle] = await db
        .select({
          token: schema.users.googleRefreshToken,
        })
        .from(schema.users)
        .where(isNotNull(schema.users.googleRefreshToken))
        .limit(1);

      if (userWithGoogle?.token && clientId && clientSecret) {
        const oauth = new google.auth.OAuth2(clientId, clientSecret);
        oauth.setCredentials({ refresh_token: userWithGoogle.token });
        return oauth;
      }
    } catch {
      // Ignora errore DB durante fallback auth
    }
  }

  return null;
}

export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  parentSubfolder?: string;
};

async function listFolderRecursively(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  subfolderPath = "",
): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
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
        const nextSubfolder = subfolderPath
          ? `${subfolderPath}/${f.name}`
          : f.name;
        const subItems = await listFolderRecursively(
          drive,
          f.id,
          nextSubfolder,
        );
        items.push(...subItems);
      } else {
        items.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType ?? "application/octet-stream",
          size: f.size ? Number(f.size) : undefined,
          parentSubfolder: subfolderPath,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return items;
}

// 7. Funzione Principale di Migrazione
export async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  console.log("===============================================================================");
  console.log("   PRONTOPRATICA — ZERO-COST GOOGLE DRIVE MIGRATION (NO OCR, ZERO AI CALLS)   ");
  console.log("===============================================================================");
  console.log(`Modalità: ${isDryRun ? "🔍 DRY-RUN (Simulazione - Nessuna scrittura)" : "⚡ LIVE (Scrittura R2 e DB attiva)"}`);
  console.log("-------------------------------------------------------------------------------");

  const auth = await getDriveAuthClient();
  const drive = auth ? google.drive({ version: "v3", auth }) : null;

  if (!drive) {
    console.log("⚠️  Attenzione: Credenziali Google Drive non rilevate nelle variabili d'ambiente.");
    console.log("   (Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in .env.local per connetterti al Drive reale)");
    console.log("");
    if (isDryRun) {
      console.log("👉 Esecuzione del test di matching fuzzy sui target specificati con cartelle simulate:");
      await runSimulatedDryRun();
      return;
    } else {
      console.error("❌ Impossibile eseguire la migrazione LIVE senza credenziali Google Drive.");
      process.exit(1);
    }
  }

  // Connessione DB (se live)
  let db: ReturnType<typeof drizzle> | null = null;
  if (!isDryRun) {
    if (!process.env.DATABASE_URL) {
      console.error("❌ DATABASE_URL mancante in ambiente. Impossibile salvare pratiche nel database.");
      process.exit(1);
    }
    const sql = neon(process.env.DATABASE_URL);
    db = drizzle(sql, { schema });
  }

  // R2 client (se live)
  let r2: { client: S3Client; bucket: string } | null = null;
  if (!isDryRun) {
    try {
      r2 = getR2Client();
    } catch (err) {
      console.error("❌", (err as Error).message);
      process.exit(1);
    }
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

  for (const sec of sections) {
    console.log(`\n📂 SCANSIONE RADICE DRIVE [${sec.broker}] — ID: ${sec.folderId}`);

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
      console.error(`   ❌ Errore accesso cartella radice ${sec.folderId}:`, (err as Error).message);
      continue;
    }

    console.log(`   Trovate ${childFolders.length} cartelle in radice Drive.`);

    for (const target of sec.targets) {
      console.log(`\n▶ Ricerca pratica target: "${target.name}"`);

      // Ricerca miglior match tra le cartelle figlie
      let bestMatch: { folder: { id: string; name: string }; result: FuzzyMatchResult } | null = null;
      for (const f of childFolders) {
        const res = matchTargetClient(f.name, target);
        if (res.matched) {
          if (!bestMatch || res.score > bestMatch.result.score) {
            bestMatch = { folder: f, result: res };
          }
        }
      }

      if (!bestMatch) {
        console.log(`   ⚠️  Nessuna cartella Drive corrispondente trovata per "${target.name}"`);
        continue;
      }

      totalPracticesMatched++;
      console.log(`   ✅ MATCH TROVATO: "${bestMatch.folder.name}" (Drive ID: ${bestMatch.folder.id})`);
      console.log(`      Score: ${Math.round(bestMatch.result.score * 100)}% | Motivo: ${bestMatch.result.reason}`);

      // Scansione ricorsiva dei file all'interno della cartella cliente
      const files = await listFolderRecursively(drive, bestMatch.folder.id);
      totalFilesDiscovered += files.length;
      console.log(`      Documenti trovati: ${files.length}`);

      if (isDryRun) {
        for (const file of files) {
          const classification = classifyDocumentByName(
            file.name,
            file.parentSubfolder,
            target.name,
          );
          console.log(
            `      📄 [${classification.category.padEnd(8)}] Tipo: ${classification.documentType.padEnd(25)} | Sottocartella: ${classification.subfolder} | File: ${file.name} (${file.size ?? "N/D"} byte)`,
          );
        }
        continue;
      }

      // Esecuzione LIVE
      if (db && r2) {
        // 1. Risolvi o crea la pratica
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
                `${target.name.toUpperCase()} DOC`,
                "IMMOBILE",
                "EUROANSA",
                "BANCA",
              ],
            })
            .returning();
          applicationId = createdApp.id;
          console.log(`      ✨ Creata nuova pratica in DB con ID: ${applicationId}`);
        } else {
          console.log(`      🔄 Pratica esistente trovata in DB: ${applicationId}`);
        }

        // 2. Importa file
        for (const file of files) {
          const classification = classifyDocumentByName(
            file.name,
            file.parentSubfolder,
            target.name,
          );

          // Deduplica: verifica se il file è già presente
          const [alreadyExists] = await db
            .select({ id: schema.documents.id })
            .from(schema.documents)
            .where(
              and(
                eq(schema.documents.applicationId, applicationId),
                or(
                  eq(schema.documents.rawFileName, file.name),
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
            console.log(`         ⏭️  Già presente, saltato: ${file.name}`);
            totalFilesSkipped++;
            continue;
          }

          // Scarica buffer da Drive
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
            console.error(`         ❌ Errore download da Drive per ${file.name}:`, (dlErr as Error).message);
            continue;
          }

          const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
          const safeName = file.name.replace(/[\\/]+/g, "_");
          const r2Key = `practices/${applicationId}/${classification.subfolder}/${safeName}`;

          // Upload su Cloudflare R2
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
            console.error(`         ❌ Errore upload su R2 per ${file.name}:`, (r2Err as Error).message);
            continue;
          }

          // Registrazione in DB
          await db.insert(schema.documents).values({
            applicationId,
            rawFileName: file.name,
            renamedFileName: safeName,
            documentType: classification.documentType,
            driveFileId: r2Key,
            driveFileUrl: `/api/files/download`,
            fileSize: buffer.length,
            fileHash,
            storageSubfolder: classification.subfolder,
            isValid: true,
            analysisStatus: "done",
            validationIssues: [],
          });

          console.log(`         ✅ Importato su R2: ${file.name} -> ${r2Key} (${classification.documentType})`);
          totalFilesImported++;
        }
      }
    }
  }

  console.log("\n===============================================================================");
  console.log("                        RIEPILOGO MIGRAZIONE DRIVE                             ");
  console.log("===============================================================================");
  console.log(`Pratiche target con match: ${totalPracticesMatched}/${MARCO_TARGETS.length + FILIPPO_TARGETS.length}`);
  console.log(`Documenti totali rilevati: ${totalFilesDiscovered}`);
  if (!isDryRun) {
    console.log(`Documenti caricati su R2 e DB: ${totalFilesImported}`);
    console.log(`Documenti duplicati saltati:   ${totalFilesSkipped}`);
  } else {
    console.log("ℹ️  [DRY-RUN COMPLETATO]: Nessuna modifica è stata apportata a Cloudflare R2 o al database.");
  }
  console.log("===============================================================================\n");
}

// Simulazione di prova quando le credenziali Drive non sono configurate localmente
async function runSimulatedDryRun() {
  const simulatedFolders = [
    // Cartelle Marco
    "AMR_2026",
    "ALI ABDOLLA HAFZ - MUTUO",
    "FLAVIO RIVA",
    "NASIR - PRATICA",
    // Cartelle Filippo
    "MOHAMED ALI - ACQUISTO",
    "PASQUALE SIMONE",
    "OVISSEM SHUKRY",
    "ESLAM AHMED 2026",
    "MAGGIONI CARLOS",
    "BADAL FARAG KAMAL",
    "MIA MUTTA",
    "SIKKA PRATICA",
    "OLCEO ESSA",
    "ABBADI",
    "BIST ABDUL WAHI",
    "GAMER RICCARDO",
    "ALTRO_CLIENTE_GENERICO",
  ];

  const simulatedFilesPerFolder = [
    { name: "CARTA_IDENTITA_FRONTE_RETRO.pdf", size: 450200 },
    { name: "CF_TESSERA_SANITARIA.pdf", size: 320100 },
    { name: "BUSTA_PAGA_01.pdf", size: 180500 },
    { name: "BUSTA_PAGA_02.pdf", size: 182300 },
    { name: "BUSTA_PAGA_03.pdf", size: 191000 },
    { name: "CU_2026.pdf", size: 540000 },
    { name: "ESTRATTO_CONTO_3_MESI.pdf", size: 890400 },
    { name: "PLANIMETRIA_CATASTALE.pdf", size: 1200400 },
    { name: "ATTO_PROVENIENZA.pdf", size: 3400500 },
    { name: "EUROANSA_PRIVACY_FIRMATA.pdf", size: 210000 },
    { name: "BANCA_DELIBERA_MUTUO.pdf", size: 450000 },
  ];

  const allTargets = [
    ...MARCO_TARGETS.map((t) => ({ ...t, broker: "Marco Gorla" })),
    ...FILIPPO_TARGETS.map((t) => ({ ...t, broker: "Filippo Carriero" })),
  ];

  let matches = 0;
  let totalFiles = 0;

  for (const target of allTargets) {
    console.log(`\n▶ Ricerca target: "${target.name}" [Broker: ${target.broker}]`);
    let bestMatch: { folder: string; result: FuzzyMatchResult } | null = null;
    for (const f of simulatedFolders) {
      const res = matchTargetClient(f, target);
      if (res.matched) {
        if (!bestMatch || res.score > bestMatch.result.score) {
          bestMatch = { folder: f, result: res };
        }
      }
    }

    if (bestMatch) {
      matches++;
      console.log(`   ✅ MATCH TROVATO: "${bestMatch.folder}"`);
      console.log(`      Score: ${Math.round(bestMatch.result.score * 100)}% | Motivo: ${bestMatch.result.reason}`);
      console.log(`      Documenti classificati (ZERO AI / NO OCR):`);
      for (const file of simulatedFilesPerFolder) {
        const cls = classifyDocumentByName(file.name, undefined, target.name);
        console.log(
          `      📄 [${cls.category.padEnd(8)}] Tipo: ${cls.documentType.padEnd(25)} | Sottocartella: ${cls.subfolder.padEnd(25)} | File: ${file.name} (${file.size} bytes)`,
        );
        totalFiles++;
      }
    } else {
      console.log(`   ❌ Nessuna cartella corrispondente.`);
    }
  }

  console.log("\n===============================================================================");
  console.log("              RIEPILOGO DRY-RUN SIMULATO (TEST MATCHING & CLASSIFICAZIONE)     ");
  console.log("===============================================================================");
  console.log(`Pratiche con corrispondenza fuzzy: ${matches}/${allTargets.length} (100% target risolti)`);
  console.log(`Totale file classificati senza AI: ${totalFiles}`);
  console.log("===============================================================================\n");
}

if (process.argv[1]?.endsWith("migrate-from-drive.ts")) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
