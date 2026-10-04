/** Nome prodotto UI (non usare marchi terzi). Override: NEXT_PUBLIC_APP_NAME */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Prontopratica";

export const APP_TAGLINE = "Gestione pratiche mutuo";

/** Tag oggetto mail clienti / prefisso notifiche — usa GMAIL_SUBJECT_TAG in env */
export const DEFAULT_GMAIL_SUBJECT_TAG = "[EUROANSA-MUTUO]";

export function gmailSubjectTag(): string {
  return (process.env.GMAIL_SUBJECT_TAG ?? DEFAULT_GMAIL_SUBJECT_TAG).trim();
}

/** Prefisso oggetto email notifiche interne (stesso tag dell’env) */
export const APP_MAIL_PREFIX = gmailSubjectTag();
