import "server-only";

import { sendResendEmail } from "@/lib/email/resend";
import type { SendAppEmailParams } from "./types";

/** Resend fallback — no Sent-folder copy (Resend infrastructure). */
export async function sendViaResend(
  params: SendAppEmailParams,
): Promise<{ imapAppended: false }> {
  await sendResendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    from: params.fromOverride,
    attachments: params.attachments,
  });
  return { imapAppended: false };
}
