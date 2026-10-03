import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "BROKER"]);

export const employmentTypeEnum = pgEnum("employment_type", [
  "DIPENDENTE_INDETERMINATO",
  "PARTITA_IVA",
  "PENSIONATO",
  "ALTRO",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "IN_ATTESA_DOCUMENTI",
  "DOCUMENTI_INCOMPLETI",
  "COMPLETA_DA_INOLTRARE",
  "INVIATA_A_SEGRETERIA",
  "ANOMALIA",
  "INVIATA_IN_BANCA",
  "PERITO_NOMINATO",
  "DELIBERATA",
]);

export const documentTypeEnum = pgEnum("document_type", [
  // Anagrafica
  "CARTA_IDENTITA",
  "TESSERA_SANITARIA",
  "PERMESSO_SOGGIORNO",
  "PASSAPORTO",
  "CERTIFICATO_RESIDENZA",
  "STATO_FAMIGLIA",
  "CERTIFICATO_STATO_LIBERO",
  "ATTO_MATRIMONIO",
  "CERTIFICATO_VEDOVANZA",
  "OMOLOGA_SEPARAZIONE",
  "SENTENZA_DIVORZIO",
  // Reddito dipendenti
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
  "MODELLO_CUD",
  "MODELLO_730",
  "CUD_730", // legacy (CUD o 730)
  "CONTRATTO_LAVORO",
  "ESTRATTO_CONTRIBUTIVO_INPS",
  "ISEE",
  // Reddito autonomi
  "MODELLO_UNICO",
  "MODELLO_UNICO_1",
  "MODELLO_UNICO_2",
  "VISURA_CAMERALE",
  "CERTIFICATO_PIVA",
  "BILANCINO",
  "FATTURE_EMESSE",
  "F24",
  // Pensionati
  "CEDOLINO_PENSIONE",
  "MODELLO_OBIS_M",
  // Banca
  "ESTRATTO_CONTO",
  "LISTA_MOVIMENTI_3_MESI",
  // Ulteriore / immobile
  "CONTRATTO_AFFITTO",
  "PRELIMINARE_COMPRAVENDITA",
  "ATTO_IMMOBILE",
  "SCHEDE_CATASTALI",
  "POLIZZE_RISPARMIO",
  "CONTRATTI_FINANZIAMENTO",
  "QUIETANZA_RATA_MUTUO",
  "NUMERO_TELEFONO_COMMERCIALISTA",
  "SCONOSCIUTO",
]);

export type PreScoringData = {
  net_monthly_income: number;
  estimated_max_installment: number;
  monthly_obligations: number;
  cud_gross_annual_income: number;
  notes: string[];
};

export type ExtractedDocumentData = {
  firstName?: string | null;
  lastName?: string | null;
  fiscalCode?: string | null;
  expiryDate?: string | null;
  referenceMonth?: string | null;
  netSalary?: number | null;
  loanDeductions?: number | null;
  grossIncomeAnnual?: number | null;
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("BROKER"),
  /** Refresh token OAuth Gmail+Drive di questo utente (casella propria). */
  googleRefreshToken: text("google_refresh_token"),
  /** Email Gmail collegata (può differire dal login CRM). */
  googleEmail: varchar("google_email", { length: 255 }),
  googleConnectedAt: timestamp("google_connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }).notNull(),
  clientFiscalCode: varchar("client_fiscal_code", { length: 16 }),
  employmentType: employmentTypeEnum("employment_type")
    .notNull()
    .default("DIPENDENTE_INDETERMINATO"),
  status: applicationStatusEnum("status")
    .notNull()
    .default("DOCUMENTI_INCOMPLETI"),
  /** Prefisso storage Blob: practices/{id} (legacy colonna drive_*) */
  driveFolderId: text("drive_folder_id"),
  /** Link cartella pratica sul sito (dashboard) */
  driveFolderUrl: text("drive_folder_url"),
  preScoringData: jsonb("pre_scoring_data").$type<PreScoringData>(),
  /**
   * Documenti richiesti PER QUESTA pratica (ogni banca/pratica è diversa).
   * Vuoto = checklist non ancora impostata dal broker → pratica incompleta.
   */
  requiredDocumentTypes: text("required_document_types")
    .array()
    .$type<DocumentType[]>()
    .notNull()
    .default([]),
  /** Cartelle storage gestite (stile Drive). Vuoto = usa le predefinite. */
  storageFolders: text("storage_folders").array().notNull().default([]),
  /** Relazione broker obbligatoria prima dell'invio a segreteria */
  relazioneStorageKey: text("relazione_storage_key"),
  relazioneFileName: text("relazione_file_name"),
  relazioneUploadedAt: timestamp("relazione_uploaded_at", { withTimezone: true }),
  /** Token per download pacchetto senza login CRM */
  packageToken: text("package_token"),
  brokerId: uuid("broker_id").references(() => users.id, { onDelete: "set null" }),
  isTest: boolean("is_test").notNull().default(false),
  sentToSecretaryAt: timestamp("sent_to_secretary_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  rawFileName: text("raw_file_name").notNull(),
  renamedFileName: text("renamed_file_name").notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  /** Pathname Blob privato (legacy colonna drive_*) */
  driveFileId: text("drive_file_id"),
  /** URL download autenticato /api/files/{id} */
  driveFileUrl: text("drive_file_url"),
  /** Nome cartella storage: es. "ALI DOC", "BANCA", "IMMOBILE" */
  storageSubfolder: text("storage_subfolder"),
  isValid: boolean("is_valid").notNull().default(false),
  extractedData: jsonb("extracted_data").$type<ExtractedDocumentData>(),
  validationIssues: text("validation_issues").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const systemSettings = pgTable("system_settings", {
  id: varchar("id", { length: 50 }).primaryKey().default("global"),
  secretaryEmail: varchar("secretary_email", { length: 255 }).notNull(),
  brokerName: varchar("broker_name", { length: 255 }).notNull(),
  autoSendToSecretary: boolean("auto_send_to_secretary").notNull().default(true),
});

export const usersRelations = relations(users, ({ many }) => ({
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  broker: one(users, {
    fields: [applications.brokerId],
    references: [users.id],
  }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  application: one(applications, {
    fields: [documents.applicationId],
    references: [applications.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
export type EmploymentType = (typeof employmentTypeEnum.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
