import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SendAppEmailAttachment } from "@/lib/email/transport/types";
import { escapeEmailText } from "@/lib/hr/email-message-format";
import { resolvePayslipEmployerHeader } from "@/lib/hr/payslip-letterhead";
import { getHrVenueSetting } from "@/lib/hr/store";
import { loadSharp } from "@/lib/storage/convert-to-webp";
import {
  DEFAULT_EMAIL_FOOTER_DISCLAIMER,
  DEFAULT_HR_EMAIL_CHROME_SETTINGS,
  EMAIL_CHROME_FOOTER_HEIGHT_CM,
  EMAIL_CHROME_HEADER_HEIGHT_CM,
  EMAIL_CHROME_SOCIAL_ICON_PX,
  EMAIL_CHROME_SOCIAL_LINK_KEYS,
  EMAIL_CHROME_SOCIAL_LINKS,
  HR_SETTINGS_KEYS,
  type EmailChromeSocialLinkKey,
  type HrEmailChromeSettings,
} from "@/lib/hr/types";

function combineLegacyFooter(partial: Record<string, unknown>): string {
  const footerText = String(partial.footerText ?? "").trim();
  if (footerText) return footerText;

  const disclaimer = String(partial.footerDisclaimer ?? "").trim();
  const address = String(partial.companyAddress ?? "").trim();
  if (disclaimer && address) return `${disclaimer}\n\n${address}`;
  return disclaimer || address;
}

/** Normalize user-entered URLs for href use. */
export function normalizeEmailChromeUrl(
  value: string | null | undefined,
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(raw) || raw.includes("/")) {
    return `https://${raw.replace(/^\/+/, "")}`;
  }
  return raw;
}

function readSocialUrl(
  partial: Record<string, unknown> | null | undefined,
  key: EmailChromeSocialLinkKey,
): string {
  return normalizeEmailChromeUrl(String(partial?.[key] ?? ""));
}

export function mergeEmailChromeSettings(
  partial:
    | (Partial<HrEmailChromeSettings> & Record<string, unknown>)
    | null
    | undefined,
): HrEmailChromeSettings {
  const base = DEFAULT_HR_EMAIL_CHROME_SETTINGS;
  const headerBg = String(
    partial?.headerBackgroundColor ?? base.headerBackgroundColor,
  ).trim();
  const footerText =
    combineLegacyFooter((partial ?? {}) as Record<string, unknown>) ||
    base.footerText;
  const raw = (partial ?? {}) as Record<string, unknown>;
  const socials = Object.fromEntries(
    EMAIL_CHROME_SOCIAL_LINK_KEYS.map((key) => [
      key,
      readSocialUrl(raw, key) || base[key],
    ]),
  ) as Pick<HrEmailChromeSettings, EmailChromeSocialLinkKey>;

  return {
    enabled:
      typeof partial?.enabled === "boolean" ? partial.enabled : base.enabled,
    headerBackgroundColor: /^#[0-9a-fA-F]{6}$/.test(headerBg)
      ? headerBg
      : base.headerBackgroundColor,
    footerText: footerText || DEFAULT_EMAIL_FOOTER_DISCLAIMER,
    ...socials,
  };
}

export function resolveEmailChromeForVenue(
  settings: HrEmailChromeSettings,
  venue: { slug?: string | null; name?: string | null },
): HrEmailChromeSettings {
  const builtIn = resolvePayslipEmployerHeader(venue);
  let footerText = settings.footerText.trim();
  if (!footerText) {
    footerText = [
      DEFAULT_EMAIL_FOOTER_DISCLAIMER,
      builtIn.address?.trim() || "",
    ]
      .filter(Boolean)
      .join("\n\n");
  } else if (
    builtIn.address &&
    !footerText.toLowerCase().includes(builtIn.address.toLowerCase()) &&
    footerText === DEFAULT_EMAIL_FOOTER_DISCLAIMER
  ) {
    footerText = `${footerText}\n\n${builtIn.address}`;
  }

  const socials = Object.fromEntries(
    EMAIL_CHROME_SOCIAL_LINK_KEYS.map((key) => [
      key,
      normalizeEmailChromeUrl(settings[key]),
    ]),
  ) as Pick<HrEmailChromeSettings, EmailChromeSocialLinkKey>;

  return {
    ...settings,
    footerText: footerText || DEFAULT_EMAIL_FOOTER_DISCLAIMER,
    ...socials,
  };
}

export async function loadEmailChromeForVenue(
  supabase: SupabaseClient,
  venue: { id: string; slug?: string | null; name?: string | null },
): Promise<HrEmailChromeSettings> {
  const stored = await getHrVenueSetting<
    Partial<HrEmailChromeSettings> & Record<string, unknown>
  >(supabase, venue.id, HR_SETTINGS_KEYS.emailChrome, {});
  return resolveEmailChromeForVenue(mergeEmailChromeSettings(stored), venue);
}

/** Stable Content-ID for the venue logo in the email header. */
export const VENUE_EMAIL_HEADER_LOGO_CID = "venue-header-logo@ss-ops-hub";

export type EmailChromeSocialIcon =
  (typeof EMAIL_CHROME_SOCIAL_LINKS)[number]["icon"];

export function emailChromeSocialCid(icon: EmailChromeSocialIcon): string {
  return `social-${icon}@ss-ops-hub`;
}

export function listConfiguredEmailChromeSocials(
  settings: HrEmailChromeSettings,
): Array<{
  key: EmailChromeSocialLinkKey;
  label: string;
  icon: EmailChromeSocialIcon;
  href: string;
}> {
  return EMAIL_CHROME_SOCIAL_LINKS.flatMap((row) => {
    const href = normalizeEmailChromeUrl(settings[row.key]);
    if (!href) return [];
    return [{ key: row.key, label: row.label, icon: row.icon, href }];
  });
}

async function readLocalPublicFile(relativePath: string): Promise<Buffer | null> {
  const candidates = [
    path.join(process.cwd(), "public", relativePath),
    path.join(process.cwd(), "apps/web/public", relativePath),
  ];
  for (const filePath of candidates) {
    try {
      return await readFile(filePath);
    } catch {
      // try next
    }
  }
  return null;
}

/** Process-lifetime cache — social icons are static public assets. */
const socialIconAttachmentCache = new Map<
  EmailChromeSocialIcon,
  SendAppEmailAttachment | null
>();

/**
 * Tiny pre-baked PNG for CID embedding (no Sharp on the send path).
 * Falls back to SVG→PNG only if the pre-baked file is missing.
 */
export async function prepareEmailSocialIconAttachment(
  icon: EmailChromeSocialIcon,
): Promise<SendAppEmailAttachment | null> {
  if (socialIconAttachmentCache.has(icon)) {
    return socialIconAttachmentCache.get(icon) ?? null;
  }

  const prebaked = await readLocalPublicFile(`email/social/${icon}.png`);
  if (prebaked && prebaked.length > 0) {
    const attachment: SendAppEmailAttachment = {
      filename: `social-${icon}.png`,
      content: prebaked.toString("base64"),
      content_type: "image/png",
      content_id: emailChromeSocialCid(icon),
    };
    socialIconAttachmentCache.set(icon, attachment);
    return attachment;
  }

  const svg = await readLocalPublicFile(`email/social/${icon}.svg`);
  if (!svg) {
    socialIconAttachmentCache.set(icon, null);
    return null;
  }
  try {
    const sharp = await loadSharp();
    const rasterPx = EMAIL_CHROME_SOCIAL_ICON_PX * 2;
    const png = await sharp(svg, { density: 180 })
      .resize(rasterPx, rasterPx, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, palette: true, colors: 16 })
      .toBuffer();
    const attachment: SendAppEmailAttachment = {
      filename: `social-${icon}.png`,
      content: png.toString("base64"),
      content_type: "image/png",
      content_id: emailChromeSocialCid(icon),
    };
    socialIconAttachmentCache.set(icon, attachment);
    return attachment;
  } catch {
    socialIconAttachmentCache.set(icon, null);
    return null;
  }
}

export function buildEmailChromeHeaderHtml(params: {
  backgroundColor: string;
  logoUrl: string | null;
  venueName: string | null;
  /** Fixed display width — never scales with viewport. Defaults to 100. */
  logoDisplayWidthPx?: number;
}): string {
  const bg = escapeEmailText(params.backgroundColor);
  const alt = escapeEmailText(params.venueName?.trim() || "Company logo");
  const height = `${EMAIL_CHROME_HEADER_HEIGHT_CM}cm`;
  const logoW = Math.max(40, Math.min(160, params.logoDisplayWidthPx ?? 100));
  const logo = params.logoUrl?.trim()
    ? `<img src="${escapeEmailText(params.logoUrl.trim())}" alt="${alt}" width="${logoW}" style="display:inline-block;width:${logoW}px;max-width:${logoW}px;max-height:2.2cm;height:auto;border:0;outline:none;text-decoration:none;vertical-align:middle;" />`
    : `<span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#3D421F;vertical-align:middle;">${alt}</span>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
  <tr>
    <td align="center" valign="middle" bgcolor="${bg}" style="background-color:${bg};height:${height};min-height:${height};padding:8px 16px;text-align:center;vertical-align:middle;">
      ${logo}
    </td>
  </tr>
</table>`;
}

export function buildEmailChromeFooterHtml(params: {
  footerText: string;
  socials: Array<{
    href: string;
    label: string;
    iconSrc: string;
  }>;
}): string {
  const minHeight = `${EMAIL_CHROME_FOOTER_HEIGHT_CM}cm`;
  const text = escapeEmailText(params.footerText.trim()).replace(/\n/g, "<br>");

  const iconPx = EMAIL_CHROME_SOCIAL_ICON_PX;
  const socialCells = params.socials
    .map(
      (item) => `<td align="center" style="padding:0 5px;">
      <a href="${escapeEmailText(item.href)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;border:0;outline:none;">
        <img src="${escapeEmailText(item.iconSrc)}" alt="${escapeEmailText(item.label)}" width="${iconPx}" height="${iconPx}" style="display:block;width:${iconPx}px;height:${iconPx}px;max-width:${iconPx}px;border:0;outline:none;text-decoration:none;" />
      </a>
    </td>`,
    )
    .join("");

  const socialsRow =
    params.socials.length > 0
      ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px auto 0;">
  <tr>${socialCells}</tr>
</table>`
      : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin-top:8px;">
  <tr>
    <td align="center" valign="top" style="border-top:1px solid #d9dcc8;min-height:${minHeight};padding:10px 12px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;color:#6b7250;">
      <div style="text-align:center;">
        ${text || "&nbsp;"}
      </div>
      ${socialsRow}
    </td>
  </tr>
</table>`;
}

export function wrapEmailBodyWithChrome(params: {
  bodyHtml: string;
  headerHtml: string;
  footerHtml: string;
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:640px;margin:0 auto;">
  <tr><td style="padding:0;">${params.headerHtml}</td></tr>
  <tr><td style="padding:20px 16px;">${params.bodyHtml}</td></tr>
  <tr><td style="padding:0;">${params.footerHtml}</td></tr>
</table>`;
}
