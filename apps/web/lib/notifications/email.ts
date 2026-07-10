import { sendResendEmail } from "@/lib/email/resend";
import { formatDateOnly } from "@/lib/hr/derived";
import type { NotificationRow, NotificationRecipient } from "./types";

export function buildExpiryEmailHtml(params: {
  recipientName: string | null;
  notifications: NotificationRow[];
  appUrl: string;
}) {
  const { recipientName, notifications, appUrl } = params;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  const rows = notifications
    .map(
      (n) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #E9E3D6;">
          <strong style="color: #3D421F;">${n.title}</strong><br/>
          <span style="font-size: 13px; color: #666;">${n.body ?? ""}</span>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #E9E3D6; white-space: nowrap; font-size: 13px; color: #666;">
          ${n.due_date ? formatDateOnly(n.due_date) : "—"}
        </td>
      </tr>`,
    )
    .join("");

  return `
    <div style="font-family: Georgia, serif; max-width: 640px; margin: 0 auto; color: #3D421F;">
      <p style="font-size: 22px; margin-bottom: 8px;">Stellar Society</p>
      <p style="font-size: 14px; color: #666; margin-top: 0;">Operational Hub — reminders</p>
      <p>${greeting}</p>
      <p>The following items need attention:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
          <tr style="background: #F0F3DD;">
            <th style="text-align: left; padding: 10px 12px; font-weight: normal; color: #666;">Alert</th>
            <th style="text-align: left; padding: 10px 12px; font-weight: normal; color: #666;">Due</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin: 28px 0;">
        <a href="${appUrl}" style="background: #818a40; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Open SS Ops Hub
        </a>
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 32px;">
        Notification preferences and unsubscribe options will be available in Settings soon.
      </p>
    </div>
  `;
}

export async function sendNotificationEmailSafe(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      "[notifications] Email skipped — set RESEND_API_KEY and RESEND_FROM_EMAIL to enable.",
    );
    return false;
  }

  try {
    await sendResendEmail(params);
    return true;
  } catch (err) {
    console.warn("[notifications] Resend send failed:", err);
    return false;
  }
}

export async function emailPendingNotificationsForRecipient(
  service: import("@supabase/supabase-js").SupabaseClient,
  recipient: NotificationRecipient,
  notifications: NotificationRow[],
): Promise<number> {
  if (notifications.length === 0) return 0;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const subject =
    notifications.length === 1
      ? `Reminder: ${notifications[0].title}`
      : `${notifications.length} reminders — SS Ops Hub`;

  const sent = await sendNotificationEmailSafe({
    to: recipient.email,
    subject,
    html: buildExpiryEmailHtml({
      recipientName: recipient.fullName,
      notifications,
      appUrl,
    }),
  });

  if (!sent) return 0;

  const ids = notifications.map((n) => n.id);
  const { error } = await service
    .from("notifications")
    .update({ email_sent_at: new Date().toISOString() })
    .in("id", ids)
    .is("email_sent_at", null);

  if (error) throw error;
  return notifications.length;
}
