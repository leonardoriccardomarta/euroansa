import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { applications, documents } from "@/db/schema";
import { evaluateChecklist } from "@/lib/checklist";
import { APPLICATION_STATUS_LABELS } from "@/lib/config/documents";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { StatusFilter } from "@/components/dashboard/status-filter";

export const dynamic = "force-dynamic";

function statusBadgeVariant(status: string) {
  if (status === "INVIATA_A_SEGRETERIA" || status === "DELIBERATA")
    return "default" as const;
  if (status === "ANOMALIA" || status === "DOCUMENTI_INCOMPLETI")
    return "destructive" as const;
  if (status === "COMPLETA_DA_INOLTRARE") return "secondary" as const;
  return "outline" as const;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const apps = await db
    .select()
    .from(applications)
    .orderBy(desc(applications.updatedAt));

  const allDocs = await db.select().from(documents);
  const docsByApp = new Map<string, typeof allDocs>();
  for (const d of allDocs) {
    const list = docsByApp.get(d.applicationId) ?? [];
    list.push(d);
    docsByApp.set(d.applicationId, list);
  }

  const filtered = status
    ? apps.filter((a) => a.status === status)
    : apps;

  const total = apps.length;
  const waiting = apps.filter(
    (a) =>
      a.status === "IN_ATTESA_DOCUMENTI" ||
      a.status === "DOCUMENTI_INCOMPLETI",
  ).length;
  const sent = apps.filter(
    (a) =>
      a.status === "INVIATA_A_SEGRETERIA" ||
      a.status === "INVIATA_IN_BANCA" ||
      a.status === "PERITO_NOMINATO" ||
      a.status === "DELIBERATA",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pratiche</h1>
        <p className="text-sm text-slate-600">
          Panoramica pratiche mutuo e avanzamento documenti
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Totale pratiche
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              In attesa documenti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-amber-700">{waiting}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Inviate / in banca
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-emerald-800">{sent}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3">
        <StatusFilter current={status} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Checklist</TableHead>
                <TableHead>Invio segreteria</TableHead>
                <TableHead>Drive</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500">
                    Nessuna pratica ancora. Le email con allegati verranno
                    elaborate dal cron.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((app) => {
                const docs = docsByApp.get(app.id) ?? [];
                const checklist = evaluateChecklist(app.employmentType, docs);
                return (
                  <TableRow key={app.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/applications/${app.id}`}
                        className="font-medium text-emerald-900 hover:underline"
                      >
                        {app.clientName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {app.clientEmail}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(app.status)}>
                        {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{checklist.progressLabel}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {app.sentToSecretaryAt
                        ? new Date(app.sentToSecretaryAt).toLocaleString("it-IT")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {app.driveFolderUrl ? (
                        <a
                          href={app.driveFolderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-emerald-800 hover:underline"
                        >
                          Cartella <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
