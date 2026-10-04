/** Nome prodotto UI (non usare marchi terzi). Override: NEXT_PUBLIC_APP_NAME */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Prontopratica";

export const APP_TAGLINE = "Gestione pratiche mutuo";

/** Prefisso oggetto email notifiche interne */
export const APP_MAIL_PREFIX = `[${APP_NAME.toUpperCase()}]`;

/** Tag oggetto mail clienti (override con GMAIL_SUBJECT_TAG in env) */
export const DEFAULT_GMAIL_SUBJECT_TAG = "[PRATICA-MUTUO]";
