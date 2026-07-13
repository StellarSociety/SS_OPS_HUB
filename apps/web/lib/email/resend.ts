type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendResendEmail({ to, subject, html }: SendEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}

// --- Brand tokens -----------------------------------------------------------
const OLIVE = "#818a40";
const DARK_OLIVE = "#3D421F";
const CREAM = "#F0F3DD";
const CREAM_BORDER = "#E9E3D6";
const PAGE_BG = "#f4f2ea";
const MUTED = "#6b6f57";

/** Shared responsive, email-client-safe shell with the Stellar Society wordmark. */
function emailShell(params: {
  preheader: string;
  heading: string;
  bodyHtml: string;
}) {
  const { preheader, heading, bodyHtml } = params;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAGE_BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${CREAM_BORDER};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:${DARK_OLIVE};padding:28px 32px;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.5px;color:${CREAM};">Stellar&nbsp;Society</p>
                <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:${OLIVE};">Operational Hub</p>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:${DARK_OLIVE};font-weight:normal;">${heading}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <div style="border-top:1px solid ${CREAM_BORDER};padding-top:16px;">
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
                    You're receiving this because an administrator manages access to the
                    Stellar Society Operational Hub. If you weren't expecting this email,
                    you can safely ignore it.
                  </p>
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${MUTED};">© Stellar Society · Operational Hub</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function paragraph(text: string) {
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${DARK_OLIVE};">${text}</p>`;
}

function ctaButton(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:10px;background:${OLIVE};">
        <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function linkFallback(href: string) {
  return `<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
    If the button doesn't work, copy and paste this link into your browser:<br />
    <a href="${href}" style="color:${OLIVE};word-break:break-all;">${href}</a>
  </p>`;
}

function stepsBlock(steps: string[]) {
  const items = steps
    .map(
      (s, i) =>
        `<tr>
          <td width="28" valign="top" style="padding:0 10px 10px 0;">
            <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${CREAM};color:${DARK_OLIVE};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;">${i + 1}</span>
          </td>
          <td valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${DARK_OLIVE};">${s}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">${items}</table>`;
}

export function buildInviteEmailHtml(params: {
  firstName: string;
  inviteLink: string;
  external?: boolean;
}) {
  const { firstName, inviteLink, external } = params;
  const intro = external
    ? "You've been granted access to the Stellar Society Operational Hub."
    : "You've been invited to the Stellar Society Operational Hub — your team's home for daily operations.";

  const body = `
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(intro)}
    ${paragraph("Getting started takes less than a minute:")}
    ${stepsBlock([
      "Accept your invitation using the button below.",
      "Create a secure password.",
      "Sign in and you're ready to go.",
    ])}
    ${ctaButton(inviteLink, "Accept invitation")}
    ${linkFallback(inviteLink)}
  `;

  return emailShell({
    preheader: "Accept your invitation to the SS Operational Hub.",
    heading: "You're invited",
    bodyHtml: body,
  });
}

export function buildPasswordResetEmailHtml(params: {
  firstName: string;
  resetLink: string;
}) {
  const { firstName, resetLink } = params;
  const body = `
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph("We received a request to reset the password for your SS Operational Hub account. Click below to choose a new password.")}
    ${ctaButton(resetLink, "Reset password")}
    ${paragraph("This link will expire shortly for your security. If you didn't request a reset, no action is needed.")}
    ${linkFallback(resetLink)}
  `;

  return emailShell({
    preheader: "Reset your SS Operational Hub password.",
    heading: "Reset your password",
    bodyHtml: body,
  });
}

export function buildWelcomeEmailHtml(params: {
  firstName: string;
  loginLink: string;
}) {
  const { firstName, loginLink } = params;
  const body = `
    ${paragraph(`Welcome aboard, ${firstName}!`)}
    ${paragraph("Your account is active and your password is set. You can now sign in to the Stellar Society Operational Hub.")}
    ${ctaButton(loginLink, "Go to the Hub")}
    ${linkFallback(loginLink)}
  `;

  return emailShell({
    preheader: "Your SS Operational Hub account is ready.",
    heading: "You're all set",
    bodyHtml: body,
  });
}
