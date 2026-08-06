import "server-only";

import {
  generateRfcMessageId,
  normalizeRfcMessageId,
} from "@/lib/email/record-staff-email";
import { sendResendEmail } from "@/lib/email/resend";
import type { SendAppEmailParams } from "./types";

/** Resend fallback — no Sent-folder copy (Resend infrastructure). */
export async function sendViaResend(
  params: SendAppEmailParams,
): Promise<{ imapAppended: false; messageId: string }> {
  const messageId =
    normalizeRfcMessageId(params.messageId) ||
    generateRfcMessageId(params.fromOverride);
  await sendResendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    from: params.fromOverride,
    attachments: params.attachments,
  });
  return { imapAppended: false, messageId };
}
