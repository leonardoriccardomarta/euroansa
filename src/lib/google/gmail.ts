import type { GoogleOAuthClient } from "./auth";
import { getGmailClient } from "./auth";
import {
  downloadFileFromDrive,
  listDriveFolderFileIds,
} from "./drive";
import {
  extractDriveFileIdsFromText,
  extractDriveFolderIdsFromText,
  isAllowedDriveAttachmentName,
} from "./drive-links";

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
  body?: {
    attachmentId?: string | null;
    data?: string | null;
    size?: number | null;
  };
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

/** Testo + HTML del messaggio (per trovare link Drive). */
function collectBodyText(part: GmailPart | null | undefined, acc: string[] = []): string[] {
  if (!part) return acc;
  const mime = (part.mimeType ?? "").toLowerCase();
  if (
    (mime === "text/plain" || mime === "text/html") &&
    part.body?.data &&
    !part.filename
  ) {
    try {
      acc.push(decodeBase64Url(part.body.data).toString("utf8"));
    } catch {
      // ignore decode errors
    }
  }
  for (const child of part.parts ?? []) {
    collectBodyText(child, acc);
  }
  return acc;
}

function isAllowedAttachmentFilename(fileName: string): boolean {
  return isAllowedDriveAttachmentName(fileName);
}

async function attachmentsFromDriveLinks(
  bodyText: string,
  auth?: GoogleOAuthClient,
): Promise<GmailAttachmentFile[]> {
  const fileIds = new Set(extractDriveFileIdsFromText(bodyText));
  const folderIds = extractDriveFolderIdsFromText(bodyText);

  for (const folderId of folderIds) {
    try {
      const children = await listDriveFolderFileIds(folderId, auth);
      for (const id of children) fileIds.add(id);
    } catch (err) {
      console.warn("drive folder list failed", folderId, err);
    }
  }

  const out: GmailAttachmentFile[] = [];
  const usedNames = new Set<string>();

  for (const fileId of fileIds) {
    try {
      const downloaded = await downloadFileFromDrive(fileId, auth);
      if (!isAllowedAttachmentFilename(downloaded.fileName)) {
        // Google Docs esportati in PDF passano; altri tipi saltati
        if (downloaded.mimeType !== "application/pdf") continue;
      }
      let filename = downloaded.fileName;
      if (!isAllowedAttachmentFilename(filename) && downloaded.mimeType === "application/pdf") {
        filename = filename.toLowerCase().endsWith(".pdf")
          ? filename
          : `${filename}.pdf`;
      }
      if (!isAllowedAttachmentFilename(filename)) continue;

      const key = filename.toLowerCase();
      if (usedNames.has(key)) {
        const dot = filename.lastIndexOf(".");
        const stem = dot > 0 ? filename.slice(0, dot) : filename;
        const ext = dot > 0 ? filename.slice(dot) : "";
        filename = `${stem}_${fileId.slice(0, 6)}${ext}`;
      }
      usedNames.add(filename.toLowerCase());

      let mimeType = downloaded.mimeType;
      const lower = filename.toLowerCase();
      if (lower.endsWith(".pdf")) mimeType = "application/pdf";
      else if (lower.endsWith(".png")) mimeType = "image/png";
      else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
        mimeType = "image/jpeg";
      else if (lower.endsWith(".webp")) mimeType = "image/webp";

      out.push({
        filename,
        mimeType,
        buffer: downloaded.buffer,
      });
    } catch (err) {
      console.warn("drive link download failed", fileId, err);
    }
  }

  return out;
}

/**
 * Trova email con oggetto corretto (tag GMAIL_SUBJECT_TAG).
 * Allegati MIME + file da link Google Drive (allegati > ~25MB).
 */
export async function fetchPendingMortgageEmails(
  maxMessages = 5,
  includeProcessed = false,
  auth?: GoogleOAuthClient,
): Promise<PendingMortgageEmail[]> {
  const gmail = getGmailClient(auth);

  const subjectTag = process.env.GMAIL_SUBJECT_TAG?.trim();
  if (!subjectTag) {
    throw new Error("Imposta GMAIL_SUBJECT_TAG nell'ambiente");
  }
  const searchToken = subjectTag.replace(/[\[\]]/g, "").trim();
  if (!searchToken) {
    throw new Error("GMAIL_SUBJECT_TAG non valida");
  }

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
    const seenNames = new Set<string>();
    const parts = collectParts(full.data.payload as GmailPart);

    for (const part of parts) {
      if (!part.body?.attachmentId || !part.filename) continue;
      if (!isAllowedAttachmentFilename(part.filename)) continue;

      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: msg.id,
        id: part.body.attachmentId,
      });

      if (!att.data.data) continue;

      const lower = part.filename.toLowerCase();
      let mimeType = part.mimeType ?? "application/octet-stream";
      if (lower.endsWith(".pdf")) mimeType = "application/pdf";
      else if (lower.endsWith(".png")) mimeType = "image/png";
      else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
        mimeType = "image/jpeg";
      else if (lower.endsWith(".webp")) mimeType = "image/webp";

      seenNames.add(part.filename.toLowerCase());
      attachments.push({
        filename: part.filename,
        mimeType,
        buffer: decodeBase64Url(att.data.data),
      });
    }

    const bodyText = collectBodyText(full.data.payload as GmailPart).join("\n");
    if (bodyText.includes("drive.google.com") || bodyText.includes("docs.google.com")) {
      const fromDrive = await attachmentsFromDriveLinks(bodyText, auth);
      for (const file of fromDrive) {
        if (seenNames.has(file.filename.toLowerCase())) continue;
        seenNames.add(file.filename.toLowerCase());
        attachments.push(file);
      }
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

export async function markMessageProcessed(
  messageId: string,
  auth?: GoogleOAuthClient,
) {
  const gmail = getGmailClient(auth);

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

export async function sendGmailHtml(
  params: {
    to: string;
    subject: string;
    html: string;
    attachments?: Array<{
      filename: string;
      mimeType: string;
      buffer: Buffer;
    }>;
  },
  auth?: GoogleOAuthClient,
) {
  const gmail = getGmailClient(auth);
  const attachments = params.attachments ?? [];
  const boundary = `app_${Date.now().toString(36)}`;

  const encodeSubject = (subject: string) => {
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
