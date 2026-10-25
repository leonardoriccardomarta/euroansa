"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ZipDownloadButton({
  applicationId,
  folderName,
  label,
  variant = "outline",
  size = "sm",
  className,
}: {
  applicationId: string;
  folderName?: string;
  label?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm";
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    if (loading) return;
    setLoading(true);
    const toastId = toast.loading(
      folderName
        ? `Preparazione archivio ZIP (${folderName})...`
        : "Preparazione intero dossier ZIP...",
    );

    try {
      const url = folderName
        ? `/api/applications/${applicationId}/zip?folder=${encodeURIComponent(folderName)}`
        : `/api/applications/${applicationId}/zip`;

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.dismiss(toastId);
        toast.error(
          data?.error || "Impossibile scaricare lo ZIP. Riprova più tardi.",
        );
        return;
      }

      const disposition = res.headers.get("Content-Disposition");
      let filename = folderName ? `${folderName}.zip` : "dossier.zip";
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
      }

      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      toast.dismiss(toastId);
      toast.success(`Download avviato: ${filename}`);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        err instanceof Error ? err.message : "Errore durante il download",
      );
    } finally {
      setLoading(false);
    }
  }

  const defaultLabel = folderName
    ? "Scarica Cartella (.zip)"
    : "Scarica Dossier (.zip)";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={loading}
      onClick={handleDownload}
      className={className ?? "gap-1.5 rounded-lg"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
      ) : (
        <Download className="h-4 w-4 text-slate-600" />
      )}
      <span>{loading ? "Generazione..." : label || defaultLabel}</span>
    </Button>
  );
}
