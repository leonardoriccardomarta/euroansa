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
  const criticalApps = apps.filter((app) => {
    if (
      app.status === "INVIATA_IN_BANCA" ||
      app.status === "DELIBERATA" ||
      app.status === "PERIZIA_INCARICATA" ||
      app.status === "PREPARAZIONE_ATTO" ||
      app.status === "DELIBERA_FINALE" ||
      app.status === "ROGITATA" ||
      app.status === "IN_ATTESA_RISCONTRO_CLIENTE" ||
      app.status === "INVIATA_A_SEGRETERIA" ||
      app.status === "DELIBERA_REDDITUALE" ||
      app.status === "PERIZIA_PRESA" ||
      app.status === "PERIZIA_EFFETTUATA"
    ) {
      return false;
    }

    const checklist = evaluateChecklist(app.requiredDocumentTypes, app.docs);
    const hasMissingDocs = checklist.isUnset || !checklist.isComplete;

    return app.status === "DOCUMENTI_INCOMPLETI" || hasMissingDocs;
  });

  criticalApps.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const selected = criticalApps.slice(0, 5);

  return selected.map((app) => {
    const daysStuck = daysBetween(app.updatedAt, now);
    const checklist = evaluateChecklist(app.requiredDocumentTypes, app.docs);
    const statusLabel =
      APPLICATION_STATUS_LABELS[app.status] ?? app.status.replace(/_/g, " ");

    let nextAction = "Completa la checklist documenti";
    if (checklist.isUnset) {
      nextAction = "Imposta la checklist documenti richiesti";
    } else if (!checklist.isComplete) {
      const missing = checklist.missing.slice(0, 3).join(", ");
      nextAction = missing
        ? `Mancano documenti: ${missing}`
        : "Completa i documenti mancanti";
    }

    if (app.lastPipelineError?.trim()) {
      nextAction = `Attenzione: ${app.lastPipelineError.slice(0, 80)}`;
    }

    return {
      applicationId: app.id,
      clientName: app.clientName,
      status: app.status,
      statusLabel,
      daysStuck,
      nextAction,
      priority: 1,
    };
  });
}
