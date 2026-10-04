/** Nome prodotto UI (non usare marchi terzi). Override: NEXT_PUBLIC_APP_NAME */
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Prontopratica";

export const APP_TAGLINE = "Gestione pratiche mutuo";

/** Oggetto mail: solo da env `GMAIL_SUBJECT_TAG` (nessun default in codice). */
export function gmailSubjectTag(): string {
  const tag = process.env.GMAIL_SUBJECT_TAG?.trim();
  if (!tag) {
    throw new Error("Imposta GMAIL_SUBJECT_TAG nell'ambiente");
  }
  return tag;
}
