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
  isEuroansaFolder,
  STORAGE_FOLDER_KINDS,
  storageSubfolderLabel,
  type StorageFolderKind,
} from "@/lib/config/documents";
import { isLegacyDriveKey, isSiteStorageKey } from "@/lib/storage/paths";
import { Badge } from "@/components/ui/badge";
import { ClassifyUnknownDoc } from "@/components/dashboard/classify-unknown-doc";
import { DocumentPreviewButton } from "@/components/dashboard/document-preview";
import { FolderUploadButton } from "@/components/dashboard/file-browser-actions";

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
}: {
  doc: Document;
  classifyOptions: DocumentType[];
  allowClassify: boolean;
}) {
  const also =
    doc.extractedData?.alsoCovers?.filter((t) => t && t !== "SCONOSCIUTO") ??
    [];
  const showClassify =
    allowClassify &&
    doc.documentType === "SCONOSCIUTO" &&
    classifyOptions.length > 0;

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
          {showClassify ? (
            <ClassifyUnknownDoc
              documentId={doc.id}
              options={classifyOptions}
            />
          ) : null}
        </div>
        {doc.driveFileUrl && isSiteStorageKey(doc.driveFileId) ? (
          <DocumentPreviewButton
            src={doc.driveFileUrl}
            fileName={doc.renamedFileName}
            label="Anteprima"
          />
        ) : null}
      </div>
      {doc.validationIssues?.length > 0 ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ul className="list-disc pl-4">
            {doc.validationIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PracticeDocumentsSection({
  applicationId,
  clientName,
  docs,
  requiredDocumentTypes,
}: {
  applicationId: string;
  clientName: string;
  docs: Document[];
  requiredDocumentTypes: DocumentType[];
}) {
  const defaultDocLabel = storageSubfolderLabel("DOC", clientName);

  const presentTypes = new Set(
    docs
      .filter((d) => d.isValid && d.documentType !== "SCONOSCIUTO")
      .map((d) => d.documentType),
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

  const byFolder = new Map<string, Document[]>();
  for (const doc of docs) {
    const key = doc.storageSubfolder?.trim() || defaultDocLabel;
    const list = byFolder.get(key) ?? [];
    list.push(doc);
    byFolder.set(key, list);
  }

  const mainFolders = STORAGE_FOLDER_KINDS.map((kind) => {
    const label = storageSubfolderLabel(kind, clientName);
    let list = byFolder.get(label) ?? [];
    if (kind === "EUROANSA") {
      const legacy = [...byFolder.entries()]
        .filter(
          ([k]) => isEuroansaFolder(k) && k !== label,
        )
        .flatMap(([, rows]) => rows);
      list = [...list, ...legacy];
    }
    return { kind, label, list };
  });

  const mainLabels = new Set(
    mainFolders.flatMap((f) =>
      f.kind === "EUROANSA"
        ? [f.label, "EUROANSA", "UFFICIO"]
        : [f.label],
    ),
  );
  const otherFolders = [...byFolder.entries()].filter(
    ([k]) => !mainLabels.has(k) && !isEuroansaFolder(k),
  );

  return (
    <section id="files" className="space-y-4">
      <div>
        <h2 className="mb-2 text-xl font-bold text-slate-900">
          Cartella documenti
        </h2>
        <p className="text-sm text-slate-600">
          Mail/AI → solo DOC e IMMOBILE (checklist). BANCA e EUROANSA = firmati
          / operativo: li carichi tu, senza classifica checklist. Relazione ha
          il blocco dedicato.
        </p>
      </div>

      {mainFolders.map(({ kind, label, list }) => (
        <div
          key={label}
          className={`rounded-xl border p-5 shadow-sm ${
            kind === "EUROANSA"
              ? "border-primary-200 bg-primary-50/40"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Folder className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">{folderHint(kind)}</p>
                <p className="text-xs text-slate-400">{list.length} file</p>
              </div>
            </div>
            <FolderUploadButton
              applicationId={applicationId}
              folderName={label}
              label={kind === "EUROANSA" ? "Carica firmati" : "Nuovo file"}
            />
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-slate-500">Cartella vuota.</p>
          ) : (
            <div className="space-y-3">
              {list.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  classifyOptions={classifyOptions}
                  allowClassify={kind === "DOC" || kind === "IMMOBILE"}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {otherFolders.map(([label, list]) => (
        <div
          key={label}
          className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">{label}</p>
              <p className="text-xs text-slate-400">{list.length} file</p>
            </div>
            <FolderUploadButton
              applicationId={applicationId}
              folderName={label}
            />
          </div>
          <div className="space-y-3">
            {list.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                classifyOptions={classifyOptions}
                allowClassify={false}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
