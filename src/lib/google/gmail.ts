import { getGmailClient } from "./auth";

export type GmailAttachment = {
  messageId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  fromEmail: string;
  subject: string;
};

function decodeBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match?.[1] ?? fromHeader).trim().toLowerCase();
}

type GmailPart = {
  filename?: string | null;
  mimeType?: string | null;
  body?: { attachmentId?: string | null; data?: string | null; size?: number | null };
  parts?: GmailPart[] | null;
};

function collectParts(part: GmailPart, acc: GmailPart[] = []): GmailPart[] {
  if (part.filename && part.body?.attachmentId) {
    acc.push(part);
  }
  for (const child of part.parts ?? []) {
    collectParts(child, acc);
  }
  return acc;
}

export async function fetchPendingMortgageEmails(
  maxMessages = 5,
): Promise<GmailAttachment[]> {
  const gmail = getGmailClient();

  // Email non ancora etichettate come elaborate, con allegati
  const list = await gmail.users.messages.list({
    userId: "me",
    q: "has:attachment -label:MUTUO-ELABORATA (subject:[MUTUO] OR subject:mutuo OR subject:documenti)",
    maxResults: maxMessages,
  });

  const messages = list.data.messages ?? [];
  const attachments: GmailAttachment[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = full.data.payload?.headers ?? [];
    const from =
      headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
    const fromEmail = extractEmail(from);

    const parts = collectParts(full.data.payload as GmailPart);
    for (const part of parts) {
      if (!part.body?.attachmentId || !part.filename) continue;
      const lower = part.filename.toLowerCase();
      if (
        !lower.endsWith(".pdf") &&
        !lower.endsWith(".jpg") &&
        !lower.endsWith(".jpeg") &&
        !lower.endsWith(".png") &&
        !lower.endsWith(".webp")
      ) {
        continue;
      }

      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: msg.id,
        id: part.body.attachmentId,
      });

      if (!att.data.data) continue;

      attachments.push({
        messageId: msg.id,
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        buffer: decodeBase64Url(att.data.data),
        fromEmail,
        subject,
      });
    }

    await markMessageProcessed(msg.id);
  }

  return attachments;
}

export async function markMessageProcessed(messageId: string) {
  const gmail = getGmailClient();

  // Crea label se manca
  const labels = await gmail.users.labels.list({ userId: "me" });
  let labelId = labels.data.labels?.find((l) => l.name === "MUTUO-ELABORATA")?.id;

  if (!labelId) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: "MUTUO-ELABORATA",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    labelId = created.data.id!;
  }

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
    },
  });
}

export async function sendGmailHtml(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const gmail = getGmailClient();
  const raw = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    params.html,
  ].join("\r\n");

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}
