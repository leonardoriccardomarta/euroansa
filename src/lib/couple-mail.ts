/**
 * Mutuo cointestatari (coppia): oggetto mail
 *   COPPIA EUROANSA MUTUO
 *   COPPIA EUROANSA MUTUO Rossi / Bianchi
 * Accetta anche trattini (EUROANSA-MUTUO) e prefissi Re:/Fwd:/[EXT].
 */

export const COUPLE_SUBJECT_PHRASE = "COPPIA EUROANSA MUTUO";

/** True se l'oggetto indica pratica unica di coppia. */
export function isCoupleEmailSubject(subject: string): boolean {
  const s = subject
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.includes("coppia") && s.includes("euroansa") && s.includes("mutuo");
}

/** Chiave per riagganciare mail successive della stessa coppia. */
export function coupleSubjectKey(subject: string): string | null {
  if (!isCoupleEmailSubject(subject)) return null;
  let s = subject.trim();
  s = s.replace(/^(re|fwd|fw)\s*:\s*/gi, "").trim();
  s = s.replace(/\[ext\]\s*/gi, "").trim();
  return s.toLowerCase().replace(/\s+/g, " ").slice(0, 200) || null;
}

/** Nome hint dall'oggetto dopo il marker (es. "Rossi / Bianchi"). */
export function coupleNameHintFromSubject(subject: string): string | null {
  if (!isCoupleEmailSubject(subject)) return null;
  let s = subject.trim();
  s = s.replace(/^(re|fwd|fw)\s*:\s*/gi, "").trim();
  s = s.replace(/\[ext\]\s*/gi, "").trim();
  const cleaned = s
    .replace(/coppia/gi, " ")
    .replace(/euroansa/gi, " ")
    .replace(/mutuo/gi, " ")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 120) : null;
}

/** Unisce cognomi/nomi in un'etichetta pratica "A / B". */
export function mergeCoupleClientName(
  current: string,
  lastName?: string | null,
  firstName?: string | null,
): string {
  const last = lastName?.trim();
  const first = firstName?.trim();
  const person = [last, first].filter(Boolean).join(" ");
  if (!person) return current;

  const cur = current.trim();
  if (
    !cur ||
    cur === "Cliente" ||
    cur.startsWith("Intake ") ||
    /^coppia\b/i.test(cur)
  ) {
    return person.slice(0, 255);
  }

  if (last && cur.toUpperCase().includes(last.toUpperCase())) {
    return cur;
  }

  const next = `${cur} / ${person}`;
  return next.slice(0, 255);
}
