import type { ApplicationStatus, DocumentType } from "@/db/schema";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { evaluateChecklist } from "@/lib/checklist";

export type PracticeAlertInput = {
  id: string;
  clientName: string;
  status: ApplicationStatus;
  updatedAt: Date;
  requiredDocumentTypes: DocumentType[] | null;
  docs: {
    documentType: DocumentType;
    isValid: boolean;
    extractedData?: { alsoCovers?: DocumentType[] | null } | null;
  }[];
  lastPipelineError?: string | null;
};

export type PracticeAlert = {
  applicationId: string;
  clientName: string;
  status: ApplicationStatus;
  statusLabel: string;
  daysStuck: number;
  nextAction: string;
  priority: number;
};

const NEXT_AFTER: Partial<Record<ApplicationStatus, string>> = {
  IN_ATTESA_DOCUMENTI: "Raccogli i documenti mancanti dal cliente",
  DOCUMENTI_INCOMPLETI: "Completa la checklist documenti",
  COMPLETA_DA_INOLTRARE: "Prepara relazione e invia a segreteria",
  INVIATA_A_SEGRETERIA: "Segui l'istruttoria / attendi delibera reddituale",
  ANOMALIA: "Risolvi l'anomalia segnalata",
  DELIBERA_REDDITUALE: "Organizza / fai prendere la perizia",
  PERIZIA_PRESA: "Attendi esito perizia, poi aggiorna lo stato",
  PERIZIA_EFFETTUATA: "Segui la delibera finale in banca",
  DELIBERA_FINALE: "Pianifica il rogito e completa gli audit",
  INVIATA_IN_BANCA: "Segui l'avanzamento in banca",
  PERITO_NOMINATO: "Attendi perizia e aggiorna lo stato",
  DELIBERATA: "Pianifica il rogito",
};

const PRIORITY: Partial<Record<ApplicationStatus, number>> = {
  ANOMALIA: 0,
  DOCUMENTI_INCOMPLETI: 1,
  IN_ATTESA_DOCUMENTI: 2,
  COMPLETA_DA_INOLTRARE: 3,
  DELIBERA_REDDITUALE: 4,
  PERIZIA_PRESA: 5,
  PERIZIA_EFFETTUATA: 6,
  DELIBERA_FINALE: 7,
  INVIATA_A_SEGRETERIA: 8,
  INVIATA_IN_BANCA: 8,
  PERITO_NOMINATO: 5,
  DELIBERATA: 7,
};

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Avvisi "prossimo passo" senza cambiare lo stato.
 * Regole da scala stati + giorni di fermo + checklist.
 */
export function buildPracticeAlerts(
  apps: PracticeAlertInput[],
  now = new Date(),
): PracticeAlert[] {
  const out: PracticeAlert[] = [];

  for (const app of apps) {
    if (app.status === "ROGITATA") continue;

    const daysStuck = daysBetween(app.updatedAt, now);
    const checklist = evaluateChecklist(app.requiredDocumentTypes, app.docs);
    const statusLabel =
      APPLICATION_STATUS_LABELS[app.status] ?? app.status.replace(/_/g, " ");

    let nextAction = NEXT_AFTER[app.status] ?? "Controlla lo stato e aggiorna a mano";

    const preBank =
      app.status === "DOCUMENTI_INCOMPLETI" ||
      app.status === "IN_ATTESA_DOCUMENTI" ||
      app.status === "COMPLETA_DA_INOLTRARE" ||
      app.status === "ANOMALIA";

    if (
      preBank &&
      (checklist.isUnset || !checklist.isComplete) &&
      app.status !== "COMPLETA_DA_INOLTRARE"
    ) {
      if (checklist.isUnset) {
        nextAction = "Imposta la checklist documenti richiesti";
      } else if (!checklist.isComplete) {
        const missing = checklist.missing.slice(0, 3).join(", ");
        nextAction = missing
          ? `Mancano documenti: ${missing}`
          : "Completa i documenti mancanti";
      }
    }

    if (app.status === "DELIBERA_REDDITUALE" && daysStuck >= 7) {
      nextAction =
        "Delibera reddituale da giorni: verifica se serve prendere la perizia";
    } else if (app.status === "PERIZIA_PRESA" && daysStuck >= 10) {
      nextAction =
        "Perizia presa da giorni: sollecita esito / aggiorna quando effettuata";
    } else if (app.status === "PERIZIA_EFFETTUATA" && daysStuck >= 7) {
      nextAction =
        "Perizia fatta: segui la delibera finale con la banca";
    } else if (app.status === "INVIATA_A_SEGRETERIA" && daysStuck >= 14) {
      nextAction =
        "In segreteria da tempo: chiedi aggiornamento / delibera reddituale";
    }

    if (app.lastPipelineError?.trim()) {
      nextAction = `Attenzione pipeline: ${app.lastPipelineError.slice(0, 80)}`;
    }

    const base = PRIORITY[app.status] ?? 9;
    const priority = base - Math.min(daysStuck, 30) * 0.01;

    out.push({
      applicationId: app.id,
      clientName: app.clientName,
      status: app.status,
      statusLabel,
      daysStuck,
      nextAction,
      priority,
    });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, 12);
}
