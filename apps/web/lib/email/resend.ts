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
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}

export function buildInviteEmailHtml(params: {
  fullName: string;
  inviteLink: string;
}) {
  const { fullName, inviteLink } = params;
  return `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #3D421F;">
      <p style="font-size: 22px; margin-bottom: 8px;">Stellar Society</p>
      <p style="font-size: 14px; color: #666; margin-top: 0;">Operational Hub</p>
      <p>Hi ${fullName},</p>
      <p>You have been invited to SS Ops Hub. Click below to set your password and sign in.</p>
      <p style="margin: 28px 0;">
        <a href="${inviteLink}" style="background: #818a40; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Accept invitation
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">If you did not expect this email, you can ignore it.</p>
    </div>
  `;
}
