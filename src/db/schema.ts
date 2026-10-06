import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  real,
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
  // Post segreteria (Filip)
  "DELIBERA_REDDITUALE",
  "PERIZIA_PRESA",
  "PERIZIA_EFFETTUATA",
  "DELIBERA_FINALE",
  "ROGITATA",
  // Legacy (migrati via ensureSchema)
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

export type PreventivoData = {
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
  /** Guida interattiva completata / saltata (null = mostrare al primo accesso). */
  tutorialCompletedAt: timestamp("tutorial_completed_at", {
    withTimezone: true,
  }),
  /** Quota su fatturato delle proprie pratiche (es. 0.50 Filip, 0.30 altro). */
  payoutSharePercent: real("payout_share_percent").notNull().default(0.3),
  /**
   * Quota nascosta sul fatturato delle pratiche di ALTRI broker (es. 0.20 Filip).
   * Visibile solo a questo utente (e admin)   mai al broker titolare.
   */
  overrideOnOthersPercent: real("override_on_others_percent")
    .notNull()
    .default(0),
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
  /** Prefisso storage R2: practices/{id} (legacy colonna drive_*) */
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
  /** Scadenza link pacchetto (tipicamente +7 giorni) */
  packageTokenExpiresAt: timestamp("package_token_expires_at", {
    withTimezone: true,
  }),
  brokerId: uuid("broker_id").references(() => users.id, { onDelete: "set null" }),
  isTest: boolean("is_test").notNull().default(false),
  sentToSecretaryAt: timestamp("sent_to_secretary_at", { withTimezone: true }),
  /** Chi ha inviato l'ultimo pacchetto (null = auto) */
  sentToSecretaryByUserId: uuid("sent_to_secretary_by_user_id").references(
    () => users.id,
    { onDelete: "set null" },
  ),
  sentToSecretaryByName: text("sent_to_secretary_by_name"),
  /** Ultimo errore pipeline (Gemini / Blob / invio segreteria) */
  lastPipelineError: text("last_pipeline_error"),
  lastPipelineErrorAt: timestamp("last_pipeline_error_at", {
    withTimezone: true,
  }),
  /** Provenienza lead / agenzia (tendina da settings) */
  provenance: varchar("provenance", { length: 255 }),
  /** Banca istituto */
  bankName: varchar("bank_name", { length: 255 }),
  /** Es. MUTUO, SURROGA, MUTUO+CQS */
  operationType: varchar("operation_type", { length: 120 }),
  phone: varchar("phone", { length: 40 }),
  loanAmount: real("loan_amount"),
  propertyAmount: real("property_amount"),
  ltvPercent: real("ltv_percent"),
  notaryName: varchar("notary_name", { length: 255 }),
  appraiserName: varchar("appraiser_name", { length: 255 }),
  /** Provvigioni manuali (€)   stile foglio Filip */
  commissionClient: real("commission_client"),
  commissionBank: real("commission_bank"),
  commissionPolicy: real("commission_policy"),
  commissionCqs: real("commission_cqs"),
  commissionLoans: real("commission_loans"),
  commissionNotary: real("commission_notary"),
  /** Data rogito (per resoconto mese) */
  rogitoAt: timestamp("rogito_at", { withTimezone: true }),
  /** Audit conformità Euroansa / Kiron */
  auditPrivacy: boolean("audit_privacy").notNull().default(false),
  auditContractSigned: boolean("audit_contract_signed").notNull().default(false),
  auditInstituteSheet: boolean("audit_institute_sheet").notNull().default(false),
  auditDdmBank: boolean("audit_ddm_bank").notNull().default(false),
  auditOriginalsVerified: boolean("audit_originals_verified")
    .notNull()
    .default(false),
  auditArchive: boolean("audit_archive").notNull().default(false),
  economicNotes: text("economic_notes"),
  /** Legacy: non più usato (relazione solo upload manuale) */
  relazioneDraftText: text("relazione_draft_text"),
  /** Preventivo PDF generato */
  preventivoStorageKey: text("preventivo_storage_key"),
  preventivoFileName: text("preventivo_file_name"),
  preventivoData: jsonb("preventivo_data").$type<PreventivoData>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Audit invii a segreteria (chi / quando / token). */
export const secretarySendLogs = pgTable("secretary_send_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  sentByUserId: uuid("sent_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  sentByName: varchar("sent_by_name", { length: 255 }).notNull(),
  packageToken: text("package_token").notNull(),
  packageExpiresAt: timestamp("package_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
  /** File fisico rimosso da R2; metadati / extracted restano */
  filePurged: boolean("file_purged").notNull().default(false),
  /** Segnato da tenere nello storico a pratica chiusa */
  keptForHistory: boolean("kept_for_history").notNull().default(false),
  extractedData: jsonb("extracted_data").$type<ExtractedDocumentData>(),
  validationIssues: text("validation_issues").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BudgetProductTarget = {
  erogato: number;
  pezzi: number;
  rate: number;
};

export type BudgetTargets = {
  mutui: BudgetProductTarget;
  cqs: BudgetProductTarget;
  polizze: BudgetProductTarget;
  prestiti: BudgetProductTarget;
};

export const DEFAULT_BUDGET_TARGETS: BudgetTargets = {
  mutui: { erogato: 3_000_000, pezzi: 30, rate: 0.03 },
  cqs: { erogato: 360_000, pezzi: 15, rate: 0.07 },
  polizze: { erogato: 65_000, pezzi: 25, rate: 0.5 },
  prestiti: { erogato: 50_000, pezzi: 5, rate: 0.05 },
};

export const systemSettings = pgTable("system_settings", {
  id: varchar("id", { length: 50 }).primaryKey().default("global"),
  secretaryEmail: varchar("secretary_email", { length: 255 }).notNull(),
  brokerName: varchar("broker_name", { length: 255 }).notNull(),
  autoSendToSecretary: boolean("auto_send_to_secretary").notNull().default(true),
  collaboratorSharePercent: real("collaborator_share_percent")
    .notNull()
    .default(0.35),
  provenanceOptions: text("provenance_options")
    .array()
    .notNull()
    .default([]),
  budgetTargets: jsonb("budget_targets").$type<BudgetTargets>(),
  budgetYear: varchar("budget_year", { length: 4 }).default("2026"),
});

export const leadOutcomeEnum = pgEnum("lead_outcome", [
  "NN_RISP",
  "NN_INT",
  "INT",
  "APP",
]);

export const agencyDevPhaseEnum = pgEnum("agency_dev_phase", [
  "CONTATTO",
  "CONSOLIDAMENTO",
]);

/** LEADS   chiamate a freddo */
export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  brokerId: uuid("broker_id").references(() => users.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 255 }),
  provenance: varchar("provenance", { length: 255 }),
  outcome: leadOutcomeEnum("outcome"),
  notes: text("notes"),
  activityMonth: timestamp("activity_month", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** APPUNTAMENTI   prime visite / consulenze */
export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  brokerId: uuid("broker_id").references(() => users.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 255 }),
  provenance: varchar("provenance", { length: 255 }),
  operationType: varchar("operation_type", { length: 120 }),
  amount: real("amount"),
  propertyAmount: real("property_amount"),
  notes: text("notes"),
  hasMandate: boolean("has_mandate").notNull().default(false),
  appointmentAt: timestamp("appointment_at", { withTimezone: true }).notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  applicationId: uuid("application_id").references(() => applications.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const resourceCategoryEnum = pgEnum("resource_category", [
  "MODULISTICA",
  "TEMPLATE",
  "POLICY",
  "PORTALI",
  "ALTRO",
]);

/** RISORSE   archivio agenzia (sostituisce Drive modulistica/template) */
export const agencyResources = pgTable("agency_resources", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  category: resourceCategoryEnum("category").notNull().default("ALTRO"),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: varchar("mime_type", { length: 120 }),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BankPolicyRow = { label: string; value: string };

/** SCHEDA BANCHE   policy consultabili in-app */
export const bankPolicies = pgTable("bank_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  bankName: varchar("bank_name", { length: 120 }).notNull().unique(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  summary: text("summary"),
  /** Matrice RIEPILOGO (etichetta → valore) */
  rows: jsonb("rows").$type<BankPolicyRow[]>().notNull().default([]),
  /** Testo completo dal tab per-banca del foglio Excel */
  detailText: text("detail_text"),
  sortOrder: real("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** SVILUPPO   rapporti agenzie immobiliari */
export const agencyDevelopment = pgTable("agency_development", {
  id: uuid("id").defaultRandom().primaryKey(),
  brokerId: uuid("broker_id").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  typology: varchar("typology", { length: 120 }),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 255 }),
  ownerName: varchar("owner_name", { length: 255 }),
  phase: agencyDevPhaseEnum("phase").notNull().default("CONTATTO"),
  week1: real("week1").notNull().default(0),
  week2: real("week2").notNull().default(0),
  week3: real("week3").notNull().default(0),
  week4: real("week4").notNull().default(0),
  clientDone: real("client_done").notNull().default(0),
  visitCount: real("visit_count").notNull().default(0),
  appointmentCount: real("appointment_count").notNull().default(0),
  collaboration: real("collaboration").notNull().default(0),
  appCount: real("app_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
export type SecretarySendLog = typeof secretarySendLogs.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type AgencyDevelopmentRow = typeof agencyDevelopment.$inferSelect;
export type AgencyResource = typeof agencyResources.$inferSelect;
export type BankPolicy = typeof bankPolicies.$inferSelect;
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
export type EmploymentType = (typeof employmentTypeEnum.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
export type LeadOutcomeDb = (typeof leadOutcomeEnum.enumValues)[number];
export type AgencyDevPhase = (typeof agencyDevPhaseEnum.enumValues)[number];
export type ResourceCategory = (typeof resourceCategoryEnum.enumValues)[number];
