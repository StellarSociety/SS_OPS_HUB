import { emailTemplateBodyToSafeFragment } from "@/lib/hr/email-message-format";
import type { HrAcknowledgementSentEmail } from "@/lib/hr/acknowledgement";

export function looksLikeFullEmailHtml(value: string): boolean {
  return /role="presentation"|cid:|padding:20px 16px/i.test(value);
}

export function extractAckButton(
  html: string,
): { href: string; label: string } | null {
  const match = html.match(
    /<a[^>]*href="([^"]*\/acknowledge\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (!match?.[1]) return null;
  const label = match[2]
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    href: match[1].replace(/&amp;/g, "&"),
    label: label || "Click here to verify",
  };
}

export function innerMessageHtml(html: string): string {
  const match = html.match(
    /padding:20px 16px;[^"]*">([\s\S]*?)<\/td>\s*<\/tr>\s*<tr>\s*<td[^>]*style="padding:0;"/i,
  );
  const inner = match?.[1]?.trim() ?? "";
  if (!inner) return "";
  return inner.replace(
    /<table[^>]*role="presentation"[\s\S]*?\/acknowledge\/[\s\S]*?<\/table>/i,
    "",
  );
}

export function acknowledgementMessageHtml(
  email: Pick<HrAcknowledgementSentEmail, "html" | "text"> | null,
): string {
  if (!email) return "";
  const html = email.html?.trim() || "";
  const rawText = email.text?.trim() || "";
  const text = rawText && !looksLikeFullEmailHtml(rawText) ? rawText : "";
  if (text) return emailTemplateBodyToSafeFragment(text);
  return innerMessageHtml(html);
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<\s*\/div\s*>/gi, "\n")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*li\s*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function acknowledgementMessageText(
  email: Pick<HrAcknowledgementSentEmail, "html" | "text"> | null,
): string {
  return htmlToPlainText(acknowledgementMessageHtml(email));
}
