import "server-only";

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import {
  generateRfcMessageId,
  normalizeRfcMessageId,
} from "@/lib/email/record-staff-email";
import type { HrEmailTransportSettings } from "@/lib/hr/types";
import type { SendAppEmailParams } from "./types";

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .map((e) => e.trim())
    .filter(Boolean);
}

function buildMailOptions(
  params: SendAppEmailParams,
  settings: HrEmailTransportSettings,
) {
  const to = toList(params.to);
  if (to.length === 0) {
    throw new Error("At least one email recipient is required.");
  }

  const fromEmail =
    params.fromOverride?.trim() || settings.smtp.fromEmail.trim();
  if (!fromEmail) {
    throw new Error("From email is not configured.");
  }

  const fromName =
    params.fromNameOverride?.trim() || settings.smtp.fromName.trim();
  const from = fromName
    ? `"${fromName.replace(/"/g, '\\"')}" <${fromEmail}>`
    : fromEmail;

  const messageId =
    normalizeRfcMessageId(params.messageId) ||
    generateRfcMessageId(fromEmail);

  return {
    from,
    to,
    cc: toList(params.cc),
    bcc: toList(params.bcc),
    replyTo: settings.smtp.replyTo?.trim() || undefined,
    subject: params.subject,
    html: params.html,
    messageId,
    attachments: (params.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
      contentType: a.content_type,
      ...(a.content_id
        ? { cid: a.content_id, contentDisposition: "inline" as const }
        : {}),
    })),
  };
}

async function buildRawMessage(
  mail: ReturnType<typeof buildMailOptions>,
): Promise<Buffer> {
  const composer = new MailComposer(mail);
  return composer.compile().build();
}

async function appendToSentFolder(params: {
  settings: HrEmailTransportSettings;
  password: string;
  raw: Buffer;
}): Promise<void> {
  const { settings, password, raw } = params;
  const host = settings.imap.host.trim();
  if (!host) {
    throw new Error("IMAP host is required to save a copy to Sent.");
  }

  const client = new ImapFlow({
    host,
    port: settings.imap.port || 993,
    secure: true,
    auth: {
      user: settings.smtp.username.trim(),
      pass: password,
    },
    logger: false,
  });

  await client.connect();
  try {
    const folder = settings.imap.sentFolder.trim() || "Sent";
    await client.append(folder, raw, ["\\Seen"]);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

/**
 * Send via SMTP, then optionally APPEND the same RFC822 buffer to the Sent folder.
 */
export async function sendViaSmtp(params: {
  message: SendAppEmailParams;
  settings: HrEmailTransportSettings;
  password: string;
}): Promise<{ imapAppended: boolean; messageId: string }> {
  const { message, settings, password } = params;

  if (!settings.smtp.host.trim()) {
    throw new Error("SMTP host is not configured.");
  }
  if (!settings.smtp.username.trim()) {
    throw new Error("SMTP username is not configured.");
  }
  if (!password) {
    throw new Error("SMTP password is not configured.");
  }

  const mail = buildMailOptions(message, settings);
  const messageId = normalizeRfcMessageId(mail.messageId);
  const raw = await buildRawMessage(mail);

  const transporter = nodemailer.createTransport({
    host: settings.smtp.host.trim(),
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: {
      user: settings.smtp.username.trim(),
      pass: password,
    },
  });

  const envelopeTo = [...mail.to, ...mail.cc, ...mail.bcc];
  await transporter.sendMail({
    envelope: {
      from: settings.smtp.fromEmail.trim() || settings.smtp.username.trim(),
      to: envelopeTo,
    },
    raw,
  });

  let imapAppended = false;
  if (settings.imap.enabled) {
    await appendToSentFolder({ settings, password, raw });
    imapAppended = true;
  }

  return { imapAppended, messageId };
}
