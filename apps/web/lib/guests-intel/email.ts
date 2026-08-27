import "server-only";

import { sendAppEmail } from "@/lib/email/transport";
import { publicAppUrl } from "@/lib/public-app-url";
import { generateQrPng } from "./qr";
import {
  applyTemplate,
  guestPassPath,
  type GuestsIntelGuest,
  type GuestsIntelIssue,
  type GuestsIntelReward,
  type GuestsIntelSettings,
} from "./types";

const DARK = "#3D421F";
const OLIVE = "#818a40";
const MUTED = "#6b6f57";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendGuestPassEmail(params: {
  venueId: string;
  venueName: string;
  settings: GuestsIntelSettings;
  guest: GuestsIntelGuest;
  reward: GuestsIntelReward;
  issue: GuestsIntelIssue;
}): Promise<{ sent: boolean; error: string | null }> {
  const { venueId, venueName, settings, guest, reward, issue } = params;
  const origin = publicAppUrl();
  const passUrl = `${origin}${guestPassPath(issue.code)}`;
  const png = await generateQrPng(passUrl);
  const firstName = guest.first_name.trim();
  const subject = applyTemplate(settings.email_subject, {
    venue: venueName,
    name: firstName,
    reward: reward.title,
    code: issue.code,
  });
  const expiry = issue.expires_at
    ? new Date(issue.expires_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "No expiry";
  const value = reward.value_label?.trim() || reward.title;
  const fromEmail = settings.from_email.trim() || undefined;
  const fromName = settings.from_name.trim() || undefined;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f2ea;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ea;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #E9E3D6;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:${DARK};padding:24px 28px;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#F0F3DD;">${escapeHtml(venueName)}</p>
                <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:${OLIVE};">Guest pass</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;">
                <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${DARK};">Hi ${escapeHtml(firstName)},</p>
                <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${DARK};">
                  Thank you for sharing your details. Your guest pass is ready — show this QR code when you visit to redeem ${escapeHtml(value)}.
                </p>
                <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${DARK};">${escapeHtml(reward.title)}</p>
                <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${MUTED};">
                  Code ${escapeHtml(issue.code)} · Valid until ${escapeHtml(expiry)}
                </p>
                <div style="text-align:center;padding:12px 0 8px;">
                  <img src="cid:guest-pass-qr" alt="Guest pass QR code" width="280" height="280" style="width:280px;height:280px;border:0;" />
                </div>
                <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${MUTED};">
                  Screenshot this email or keep the QR on your phone. You can also open your pass here:<br />
                  <a href="${escapeHtml(passUrl)}" style="color:${OLIVE};word-break:break-all;">${escapeHtml(passUrl)}</a>
                </p>
                ${
                  reward.terms
                    ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(reward.terms)}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                <p style="margin:16px 0 0;border-top:1px solid #E9E3D6;padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">
                  ${escapeHtml(venueName)} · ${escapeHtml(settings.from_email)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    await sendAppEmail(
      {
        to: guest.email,
        subject,
        html,
        fromOverride: fromEmail,
        fromNameOverride: fromName,
        attachments: [
          {
            filename: "guest-pass.png",
            content: png.toString("base64"),
            content_type: "image/png",
            content_id: "guest-pass-qr",
          },
        ],
      },
      { venueId },
    );
    return { sent: true, error: null };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Could not send email.",
    };
  }
}
