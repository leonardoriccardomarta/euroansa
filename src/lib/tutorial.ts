import type { DocumentType } from "@/db/schema";

/** Nome cliente della pratica guida (visibile in lista). */
export const TUTORIAL_CLIENT_NAME = "Guida Cliente Demo";

/** Prefisso email pratica tutorial (una per utente). */
export function tutorialClientEmail(userId: string): string {
  const compact = userId.replace(/-/g, "").slice(0, 24);
  return `tutorial.${compact}@prontopratica.local`;
}

export function isTutorialPractice(params: {
  clientName?: string | null;
  clientEmail?: string | null;
}): boolean {
  if (params.clientName?.startsWith("Guida")) return true;
  if (params.clientEmail?.startsWith("tutorial.") && params.clientEmail.endsWith("@prontopratica.local")) {
    return true;
  }
  return false;
}

/** Checklist iniziale della pratica demo (dipendente tipico). */
export const TUTORIAL_REQUIRED_DOCS: DocumentType[] = [
  "CARTA_IDENTITA",
  "TESSERA_SANITARIA",
  "BUSTA_PAGA_1",
  "BUSTA_PAGA_2",
  "BUSTA_PAGA_3",
  "MODELLO_CUD",
  "ESTRATTO_CONTO",
  "LISTA_MOVIMENTI_3_MESI",
  "ATTO_IMMOBILE",
];
