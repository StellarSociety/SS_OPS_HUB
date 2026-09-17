import { digitsOnly, whatsappChatUrl } from "@/lib/hr/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function phoneTelUrl(raw: string | null | undefined): string | null {
  const digits = digitsOnly(raw ?? "");
  if (digits.length < 8) return null;
  return `tel:+${digits}`;
}

export function directoryWhatsappUrl(
  raw: string | null | undefined,
): string | null {
  return whatsappChatUrl(raw);
}

export function mailtoUrl(raw: string | null | undefined): string | null {
  const email = raw?.trim() ?? "";
  if (!EMAIL_RE.test(email)) return null;
  return `mailto:${email}`;
}
