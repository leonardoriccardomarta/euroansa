import {
  AlertCircle,
  CheckCircle2,
  Folder,
} from "lucide-react";
import type { Document } from "@/db/schema";
import type { DocumentType } from "@/db/schema";
import {
  CHECKLIST_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  defaultStorageFolders,
  isEuroansaFolder,
  multiSlotGroupFor,
  PAYSLIP_SLOTS,
  STORAGE_FOLDER_KINDS,
  storageSubfolderLabel,
  type StorageFolderKind,
} from "@/lib/config/documents";
import { isLegacyDriveKey, isSiteStorageKey } from "@/lib/storage/paths";
import { Badge } from "@/components/ui/badge";
import { AcceptDocumentAnyway } from "@/components/dashboard/accept-document-anyway";
import { ClassifyUnknownDoc } from "@/components/dashboard/classify-unknown-doc";
import { DeletePracticeDoc } from "@/components/dashboard/delete-practice-doc";
import { DocumentPreviewButton } from "@/components/dashboard/document-preview";
import {
  CreateFolderForm,
  DeleteFolderButton,
  FolderReorderButtons,
  FolderUploadButton,
  MoveDocumentSelect,
  RenameFolderDialog,
} from "@/components/dashboard/file-browser-actions";
import { RenameDocumentDialog } from "@/components/dashboard/rename-document-dialog";
import { ZipDownloadButton } from "@/components/dashboard/zip-download-button";
import {
  documentRecencyScore,
  rankDuplicateDocuments,
  type DuplicateRankInfo,
} from "@/lib/documents/duplicate-rank";

function folderHint(kind: StorageFolderKind): string {
  if (kind === "DOC")
    return "Documenti cliente da mail (checklist): CI, buste, CUD, estratti…";
  if (kind === "BANCA")
    return "Firmati / operativo banca (DDM, consegna…). Fuori checklist.";
  if (kind === "IMMOBILE") return "Documenti immobile (checklist): atto, catastale…";
  return "Fogli firmati Euroansa (fuori checklist): privacy, contratto…";
}

function DocRow({
  doc,
  classifyOptions,
  allowClassify,
  dupRank,
  presentTypes,
  allFolders,
  currentFolder,
}: {
  doc: Document;
  classifyOptions: DocumentType[];
  allowClassify: boolean;
  dupRank?: DuplicateRankInfo;
  /** Tipi presenti in pratica (anche non validi) per badge multi-slot */
  presentTypes: Set<DocumentType>;
  allFolders?: string[];
  currentFolder?: string;
}) {
  const also =
    doc.extractedData?.alsoCovers?.filter((t) => t && t !== "SCONOSCIUTO") ??
    [];
  const showClassify = allowClassify && classifyOptions.length > 0;
  const showAccept =
    allowClassify &&
    !doc.isValid &&
    doc.documentType !== "SCONOSCIUTO" &&
    doc.analysisStatus !== "pending" &&
    doc.analysisStatus !== "processing";

  const multiGroup = multiSlotGroupFor(doc.documentType);
  const multiPresent = multiGroup
    ? multiGroup.filter((t) => presentTypes.has(t)).length
    : 0;
  const multiTotal = multiGroup?.length ?? 0;
  const slotIndex = multiGroup
    ? multiGroup.indexOf(doc.documentType) + 1
    : 0;
  const monthHint = doc.extractedData?.referenceMonth?.trim();

  return (
    <div className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
            {doc.isValid ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            {multiGroup && multiTotal > 1 ? (
              <Badge
                variant="outline"
                className={
                  multiPresent >= multiTotal
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-sky-200 bg-sky-50 text-sky-900"
                }
              >
                {monthHint
                  ? `${monthHint} · slot ${slotIndex}/${multiTotal}`
                  : `Slot ${slotIndex}/${multiTotal}`}
                {multiPresent < multiTotal
                  ? ` · in pratica ${multiPresent}/${multiTotal}`
                  : ""}
              </Badge>
            ) : null}
            {dupRank ? (
              <Badge
                variant="outline"
                className={
                  dupRank.isNewest
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }
              >
                {dupRank.isNewest
                  ? `Copia più recente (1/${dupRank.count})`
                  : dupRank.isOldest
                    ? `Copia più vecchia (${dupRank.rankByRecency}/${dupRank.count})`
                    : `Copia ${dupRank.rankByRecency}/${dupRank.count}`}
              </Badge>
            ) : null}
            {doc.analysisStatus === "pending" ||
            doc.analysisStatus === "processing" ? (
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-800"
              >
                {doc.analysisStatus === "processing"
                  ? "Analisi in corso"
                  : "In coda OCR"}
              </Badge>
            ) : doc.analysisStatus === "failed" ? (
              <Badge
                variant="outline"
                className="border-red-200 bg-red-50 text-red-700"
              >
                Analisi fallita
              </Badge>
            ) : null}
            {isLegacyDriveKey(doc.driveFileId) ? (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800"
              >
                Solo Drive · ricarica
              </Badge>
            ) : doc.filePurged ? (
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-50 text-slate-600"
              >
                Storico
              </Badge>
            ) : doc.keptForHistory ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-800"
              >
                Tenuto
              </Badge>
            ) : !doc.driveFileId ? (
              <Badge
                variant="outline"
                className="border-red-200 bg-red-50 text-red-700"
              >
                Non in storage
              </Badge>
            ) : null}
            {doc.isValid &&
            doc.validationIssues?.some((i) =>
              /accettato manualmente/i.test(i),
            ) ? (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-emerald-800"
              >
                Accettato manualmente
              </Badge>
            ) : null}
          </p>
          {also.length > 0 ? (
            <p className="mt-1 text-xs text-primary-700">
              Copre anche:{" "}
              {also.map((t) => DOCUMENT_TYPE_LABELS[t] ?? t).join(", ")}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">
            Originale: {doc.rawFileName}
          </p>
          <p className="text-xs text-slate-500">
            Rinominato: {doc.renamedFileName}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <RenameDocumentDialog
              documentId={doc.id}
              currentName={doc.renamedFileName || doc.rawFileName}
            />
            {allFolders && currentFolder ? (
              <MoveDocumentSelect
                documentId={doc.id}
                currentFolder={currentFolder}
                availableFolders={allFolders}
              />
            ) : null}
            {showClassify ? (
              <ClassifyUnknownDoc
                documentId={doc.id}
                options={classifyOptions}
                currentType={doc.documentType}
              />
            ) : null}
            {showAccept ? (
              <AcceptDocumentAnyway documentId={doc.id} />
            ) : null}
            {allowClassify ? (
              <DeletePracticeDoc
                documentId={doc.id}
                fileName={doc.renamedFileName || doc.rawFileName}
              />
            ) : null}
          </div>
        </div>
        {doc.driveFileUrl && isSiteStorageKey(doc.driveFileId) ? (
          <DocumentPreviewButton
            src={doc.driveFileUrl}
            fileName={doc.renamedFileName}
            label="Anteprima"
          />
        ) : null}
      </div>
      {doc.validationIssues?.length > 0
        ? (() => {
            const isDupNote = (i: string) =>
              /stesso tipo già|copia|secondo file|confronta date|già presente in pratica/i.test(
                i,
              );
            const isManualAcceptNote = (i: string) =>
              /accettato manualmente/i.test(i);

            // Se il documento è valido (es. accettato manualmente o approvato),
            // non mostrare il riquadro rosso bloccante
            const blocking = doc.isValid
              ? []
              : doc.validationIssues.filter(
                  (i) => !isDupNote(i) && !isManualAcceptNote(i),
                );
            const discretionary = dupRank
              ? doc.validationIssues.filter(isDupNote)
              : [];
            // Solo copie OK da confrontare (discrezione Filip) → giallo; errori veri → rosso
            if (blocking.length === 0 && discretionary.length === 0) return null;
            return (
              <>
                {blocking.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <ul className="list-disc pl-4">
                      {blocking.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {discretionary.length > 0 && blocking.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <ul className="list-disc pl-4">
                      {discretionary.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            );
          })()
        : null}
    </div>
  );
}

export function PracticeDocumentsSection({
  applicationId,
  clientName,
  docs,
  requiredDocumentTypes,
  folders,
  isCouple,
}: {
  applicationId: string;
  clientName: string;
  docs: Document[];
  requiredDocumentTypes: DocumentType[];
  folders?: string[];
  isCouple?: boolean;
}) {
  const defaultDocLabel = storageSubfolderLabel("DOC", clientName);

  const allFolders =
    folders && folders.length > 0
      ? folders
      : defaultStorageFolders(clientName, isCouple);

  const fallbackFolder = allFolders[0] ?? defaultDocLabel;

  // Raggruppa per cartella e normalizza gli slot indipendentemente per ogni richiedente
  const byFolderRaw = new Map<string, Document[]>();
  for (const doc of docs) {
    let key = doc.storageSubfolder?.trim() || fallbackFolder;
    if (!allFolders.includes(key)) {
      if (/ DOC$/i.test(key) && allFolders.includes(defaultDocLabel)) {
        key = defaultDocLabel;
      } else if (isEuroansaFolder(key) && allFolders.includes("EUROANSA")) {
        key = "EUROANSA";
      }
    }
    const list = byFolderRaw.get(key) ?? [];
    list.push({ ...doc });
    byFolderRaw.set(key, list);
  }

  const byFolder = new Map<string, Document[]>();
  const normalizedDocs: Document[] = [];

  for (const [folderKey, folderDocs] of byFolderRaw) {
    const payslips = folderDocs.filter(
      (d) =>
        PAYSLIP_SLOTS.includes(d.documentType) ||
        /busta.?paga|cedolino|(^|[_\s-])bp([_\s-]|$)/i.test(
          d.renamedFileName || d.rawFileName || "",
        ),
    );

    if (payslips.length >= 2) {
      const sorted = [...payslips].sort(
        (a, b) => documentRecencyScore(b) - documentRecencyScore(a),
      );
      sorted.forEach((p, sIdx) => {
        if (sIdx < PAYSLIP_SLOTS.length) {
          p.documentType = PAYSLIP_SLOTS[sIdx];
        }
      });
    }

    byFolder.set(folderKey, folderDocs);
    normalizedDocs.push(...folderDocs);
  }

  const presentTypes = new Set(
    normalizedDocs
      .filter((d) => d.isValid && d.documentType !== "SCONOSCIUTO")
      .map((d) => d.documentType),
  );
  /** Per badge multi-slot: conta anche i da rivedere */
  const presentTypesAny = new Set<DocumentType>(
    normalizedDocs
      .filter((d) => d.documentType && d.documentType !== "SCONOSCIUTO")
      .flatMap((d) => {
        const extra =
          d.extractedData?.alsoCovers?.filter(
            (t): t is DocumentType => Boolean(t && t !== "SCONOSCIUTO"),
          ) ?? [];
        return [d.documentType, ...extra];
      }),
  );
  const required = (requiredDocumentTypes ?? []).filter(
    (t) => t && t !== "SCONOSCIUTO",
  );
  const missing = required.filter((t) => !presentTypes.has(t));
  const classifyOptions = [
    ...new Set([
      ...missing,
      ...required,
      ...CHECKLIST_DOCUMENT_TYPES,
    ]),
  ];

  const dupRanks = rankDuplicateDocuments(normalizedDocs);

  // Preserve folder order from allFolders, plus any orphan folders that contain documents
  const combinedFolders = [
    ...allFolders,
    ...[...byFolder.keys()].filter((k) => !allFolders.includes(k)),
  ];

  return (
    <section id="files" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="mb-1 text-xl font-bold text-slate-900">
            Cartelle e documenti
          </h2>
          <p className="text-sm text-slate-600">
            Mail/AI → solo DOC e IMMOBILE (checklist). BANCA e EUROANSA = firmati
            / operativo. Sposta i file, riordina o rinomina le cartelle in tempo reale.
          </p>
        </div>
        <ZipDownloadButton
          applicationId={applicationId}
          label="Scarica Dossier (.zip)"
          variant="default"
          className="bg-primary-600 font-semibold text-white hover:bg-primary-700"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <CreateFolderForm applicationId={applicationId} />
      </div>

      {combinedFolders.map((label, idx) => {
        const list = byFolder.get(label) ?? [];
        const isEuro = label === "EUROANSA" || label === "UFFICIO";

        return (
          <div
            key={label}
            className={`rounded-xl border p-5 shadow-sm ${
              isEuro
                ? "border-primary-200 bg-primary-50/40"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Folder className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-400">{list.length} file</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FolderReorderButtons
                  applicationId={applicationId}
                  folderName={label}
                  isFirst={idx === 0}
                  isLast={idx === combinedFolders.length - 1}
                />
                <RenameFolderDialog
                  applicationId={applicationId}
                  currentName={label}
                />
                <ZipDownloadButton
                  applicationId={applicationId}
                  folderName={label}
                  label="Scarica Cartella (.zip)"
                />
                <FolderUploadButton
                  applicationId={applicationId}
                  folderName={label}
                  label={isEuro ? "Carica firmati" : "Nuovo file"}
                />
                <DeleteFolderButton
                  applicationId={applicationId}
                  folderName={label}
                />
              </div>
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-slate-500">Cartella vuota.</p>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const folderPresentTypes = new Set<DocumentType>(
                    list
                      .filter((d) => d.documentType && d.documentType !== "SCONOSCIUTO")
                      .flatMap((d) => {
                        const extra =
                          d.extractedData?.alsoCovers?.filter(
                            (t): t is DocumentType => Boolean(t && t !== "SCONOSCIUTO"),
                          ) ?? [];
                        return [d.documentType, ...extra];
                      }),
                  );
                  return list.map((doc) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      classifyOptions={classifyOptions}
                      allowClassify={
                        /DOC/i.test(label) ||
                        label === "IMMOBILE" ||
                        label.startsWith("Richiedente") ||
                        label.startsWith("Immobile")
                      }
                      dupRank={dupRanks.get(doc.id)}
                      presentTypes={folderPresentTypes}
                      allFolders={combinedFolders}
                      currentFolder={label}
                    />
                  ));
                })()}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
