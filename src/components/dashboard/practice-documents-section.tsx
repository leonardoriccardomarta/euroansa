import {
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { Document } from "@/db/schema";
import {
  DOCUMENT_TYPE_LABELS,
  isEuroansaFolder,
  STORAGE_FOLDER_KINDS,
  storageSubfolderLabel,
  type StorageFolderKind,
} from "@/lib/config/documents";
import { isLegacyDriveKey, isSiteStorageKey } from "@/lib/storage/paths";
import { Badge } from "@/components/ui/badge";
import { DocumentPreviewButton } from "@/components/dashboard/document-preview";
import { DocumentUpload } from "@/components/dashboard/document-upload";

function DocRow({ doc }: { doc: Document }) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
            {doc.isValid ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
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
          <p className="mt-1 text-xs text-slate-500">
            Originale: {doc.rawFileName}
          </p>
          <p className="text-xs text-slate-500">
            Rinominato: {doc.renamedFileName}
          </p>
          {doc.extractedData ? (
            <p className="mt-2 text-xs text-slate-600">
              {[
                doc.extractedData.lastName || doc.extractedData.firstName
                  ? `${doc.extractedData.lastName ?? ""} ${doc.extractedData.firstName ?? ""}`.trim()
                  : null,
                doc.extractedData.fiscalCode
                  ? `CF ${doc.extractedData.fiscalCode}`
                  : null,
                doc.extractedData.referenceMonth
                  ? `Mese ${doc.extractedData.referenceMonth}`
                  : null,
                typeof doc.extractedData.netSalary === "number"
                  ? `Netto €${doc.extractedData.netSalary.toFixed(2)}`
                  : null,
                typeof doc.extractedData.grossIncomeAnnual === "number"
                  ? `Lordo €${doc.extractedData.grossIncomeAnnual.toFixed(2)}`
                  : null,
                doc.extractedData.expiryDate
                  ? `Scad. ${doc.extractedData.expiryDate}`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
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

function FolderBlock({
  title,
  hint,
  list,
  accent,
}: {
  title: string;
  hint?: string;
  list: Document[];
  accent: "client" | "signed" | "ops";
}) {
  if (!list.length) return null;
  const border =
    accent === "signed"
      ? "border-primary-200 bg-primary-50/40"
      : accent === "client"
        ? "border-slate-200 bg-white"
        : "border-slate-200 bg-slate-50/80";
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${border}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {hint ? <p className="mt-1 text-sm text-slate-600">{hint}</p> : null}
      <div className="mt-3 space-y-3">
        {list.map((doc) => (
          <DocRow key={doc.id} doc={doc} />
        ))}
      </div>
    </div>
  );
}

export function PracticeDocumentsSection({
  applicationId,
  clientName,
  docs,
}: {
  applicationId: string;
  clientName: string;
  docs: Document[];
}) {
  const defaultDocLabel = storageSubfolderLabel("DOC", clientName);
  const euroansaLabel = storageSubfolderLabel("EUROANSA", clientName);
  const bancaLabel = storageSubfolderLabel("BANCA", clientName);
  const immobileLabel = storageSubfolderLabel("IMMOBILE", clientName);

  const byFolder = new Map<string, Document[]>();
  for (const doc of docs) {
    const key = doc.storageSubfolder?.trim() || defaultDocLabel;
    const list = byFolder.get(key) ?? [];
    list.push(doc);
    byFolder.set(key, list);
  }

  const clientDocs = byFolder.get(defaultDocLabel) ?? [];
  const signedDocs = [
    ...(byFolder.get(euroansaLabel) ?? []),
    ...[...byFolder.entries()]
      .filter(
        ([k]) =>
          isEuroansaFolder(k) &&
          k !== euroansaLabel,
      )
      .flatMap(([, list]) => list),
  ];
  const bancaDocs = byFolder.get(bancaLabel) ?? [];
  const immobileDocs = byFolder.get(immobileLabel) ?? [];

  const known = new Set([
    defaultDocLabel,
    euroansaLabel,
    bancaLabel,
    immobileLabel,
    "EUROANSA",
    "UFFICIO",
  ]);
  const otherFolders = [...byFolder.entries()].filter(([k]) => !known.has(k) && !isEuroansaFolder(k));

  return (
    <section id="files" className="space-y-4">
      <div>
        <h2 className="mb-2 text-xl font-bold text-slate-900">
          Cartella documenti
        </h2>
        <p className="text-sm text-slate-600">
          Checklist = documenti cliente in DOC e IMMOBILE. Fuori checklist:
          fogli firmati (EUROANSA), BANCA operativa, relazione.
          Cartelle:{" "}
          {STORAGE_FOLDER_KINDS.map((k: StorageFolderKind) =>
            storageSubfolderLabel(k, clientName),
          ).join(", ")}
          .
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nessun documento caricato.
        </div>
      ) : null}

      <FolderBlock
        title="Documenti dal cliente"
        hint={`Cartella ${defaultDocLabel}: CUD, CI, buste paga…`}
        list={clientDocs}
        accent="client"
      />
      <FolderBlock
        title="Banca"
        hint="Documentazione istituto / istruttoria"
        list={bancaDocs}
        accent="ops"
      />
      <FolderBlock
        title="Immobile"
        hint="Atto, catastale, preliminare…"
        list={immobileDocs}
        accent="ops"
      />
      <FolderBlock
        title="Fogli firmati"
        hint="Cartella EUROANSA: privacy, contratto, DDM… Entrano nel pacchetto segreteria."
        list={signedDocs}
        accent="signed"
      />

      {otherFolders.map(([label, list]) => (
        <FolderBlock
          key={label}
          title={label}
          list={list}
          accent="ops"
        />
      ))}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <DocumentUpload applicationId={applicationId} />
      </div>
    </section>
  );
}
