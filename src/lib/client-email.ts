/** Email tecnica interna (intake/OCR/cartella) — non mostrare in UI come mail cliente. */
export function isPlaceholderClientEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return true;
  if (e.endsWith("@prontopratica.local")) return true;
  if (e.startsWith("intake.") || e.startsWith("cf.") || e.startsWith("cartella.")) {
    return true;
  }
  return false;
}

/** Email da mostrare in dashboard/scheda; null se non ancora impostata dal broker. */
export function displayClientEmail(email: string | null | undefined): string | null {
  if (isPlaceholderClientEmail(email)) return null;
  return email!.trim().toLowerCase();
}
