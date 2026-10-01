import { getGmailClient } from "./auth";

export type GmailAttachmentFile = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type PendingMortgageEmail = {
  messageId: string;
  fromEmail: string;
  subject: string;
  attachments: GmailAttachmentFile[];
};

/** @deprecated use PendingMortgageEmail */
export type GmailAttachment = GmailAttachmentFile & {
  messageId: string;
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

/**
 * Trova email con oggetto corretto (tag EUROANSA-MUTUO).
 * Include anche mail SENZA allegati → pratica "Documenti incompleti".
 */
export async function fetchPendingMortgageEmails(
  maxMessages = 5,
  includeProcessed = false,
): Promise<PendingMortgageEmail[]> {
  const gmail = getGmailClient();

  const subjectTag = (
    process.env.GMAIL_SUBJECT_TAG ?? "[EUROANSA-MUTUO]"
  ).trim();
  const searchToken = subjectTag.replace(/[\[\]]/g, "").trim() || "EUROANSA-MUTUO";

  const list = await gmail.users.messages.list({
    userId: "me",
    q: includeProcessed
      ? `subject:${searchToken}`
      : `-label:MUTUO-ELABORATA subject:${searchToken}`,
    maxResults: maxMessages,
  });

  const messages = list.data.messages ?? [];
  const emails: PendingMortgageEmail[] = [];

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

    const attachments: GmailAttachmentFile[] = [];
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

      let mimeType = part.mimeType ?? "application/octet-stream";
      if (lower.endsWith(".pdf")) mimeType = "application/pdf";
      else if (lower.endsWith(".png")) mimeType = "image/png";
      else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
        mimeType = "image/jpeg";
      else if (lower.endsWith(".webp")) mimeType = "image/webp";

      attachments.push({
        filename: part.filename,
        mimeType,
        buffer: decodeBase64Url(att.data.data),
      });
    }

    emails.push({
      messageId: msg.id,
      fromEmail,
      subject,
      attachments,
    });
  }

  return emails;
}

export async function markMessageProcessed(messageId: string) {
  const gmail = getGmailClient();

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
  attachments?: Array<{
    filename: string;
    mimeType: string;
    buffer: Buffer;
  }>;
}) {
  const gmail = getGmailClient();
  const attachments = params.attachments ?? [];
  const boundary = `euroansa_${Date.now().toString(36)}`;

  const encodeSubject = (subject: string) => {
    // RFC 2047 per caratteri non-ASCII
    if (/^[\x20-\x7E]*$/.test(subject)) return subject;
    return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  };

  const lines: string[] = [
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (attachments.length === 0) {
    lines.push(
      "Content-Type: text/html; charset=utf-8",
      "",
      params.html,
    );
  } else {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(params.html);

    for (const att of attachments) {
      const safeName = att.filename.replace(/"/g, "");
      lines.push(`--${boundary}`);
      lines.push(
        `Content-Type: ${att.mimeType}; name="${safeName}"`,
      );
      lines.push(
        `Content-Disposition: attachment; filename="${safeName}"`,
      );
      lines.push("Content-Transfer-Encoding: base64");
      lines.push("");
      // Righe base64 da 76 caratteri
      const b64 = att.buffer.toString("base64");
      for (let i = 0; i < b64.length; i += 76) {
        lines.push(b64.slice(i, i + 76));
      }
    }
    lines.push(`--${boundary}--`);
  }

  const encoded = Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}
