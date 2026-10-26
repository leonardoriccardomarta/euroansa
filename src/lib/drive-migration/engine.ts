import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { google, type Auth } from "googleapis";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, ilike, and, or, isNotNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { DocumentType } from "@/db/schema";

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

  if (normCandidate === normTarget) {
    return { matched: true, score: 1.0, reason: "Corrispondenza esatta" };
  }

  const candidateTokens = normCandidate.split(" ").filter((t) => t.length > 0);
  const targetTokens = normTarget.split(" ").filter((t) => t.length > 0);

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

  if (
    normCandidate.includes(normTarget) ||
    (normTarget.length >= 4 && normCandidate.includes(normTarget))
  ) {
    const isSingleShortWord = normTarget.length <= 4;
    if (!isSingleShortWord || candidateTokens.includes(normTarget)) {
      return {
        matched: true,
        score: 0.92,
        reason: `Nome target contenuto per intero nella cartella`,
      };
    }
  }

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

  const fullSim = stringSimilarity(normCandidate, normTarget);
  if (fullSim >= 0.8) {
    return {
      matched: true,
      score: Number(fullSim.toFixed(2)),
      reason: `Similarità Levenshtein ${Math.round(fullSim * 100)}% (soglia >= 80%)`,
    };
  }

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

  // 1. CLIENT
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

  // 2. IMMOBILE
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

  // 3. EUROANSA
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

  // 4. BANCA
  if (
    /\b(BANCA|DDM|PIES|MUTUO|DELIBERA|CONTRATTO MUTUO)\b/.test(norm)
  ) {
    return { category: "BANCA", documentType: "SCONOSCIUTO", subfolder: "BANCA" };
  }

  // 5. Fallback su sottocartella
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

export type MigrationPracticeDetail = {
  target: string;
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

      const classifiedFiles = rawFiles.map((file) => {
        const cls = classifyDocumentByName(
          file.name,
          file.parentSubfolder,
          target.name,
        );
        return {
          name: file.name,
          category: cls.category,
          type: cls.documentType,
          subfolder: cls.subfolder,
          size: file.size,
          id: file.id,
          mimeType: file.mimeType,
        };
      });

      details.push({
        target: target.name,
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
          const safeName = file.name.replace(/[\\/]+/g, "_");
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
            documentType: file.type as DocumentType,
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
