import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SendAppEmailAttachment } from "@/lib/email/transport/types";
import {
  buildEmailChromeFooterHtml,
  buildEmailChromeHeaderHtml,
  emailChromeSocialCid,
  listConfiguredEmailChromeSocials,
  loadEmailChromeForVenue,
  prepareEmailSocialIconAttachment,
  VENUE_EMAIL_HEADER_LOGO_CID,
  wrapEmailBodyWithChrome,
} from "@/lib/hr/email-chrome";
import { emailTemplateBodyToHtml } from "@/lib/hr/email-message-format";
import type { HrEmailChromeSettings } from "@/lib/hr/types";
import { loadSharp } from "@/lib/storage/convert-to-webp";
import {
  getVenueLogoUrl,
  type VenueBrandAssetSource,
} from "@/lib/venue/branding";
import { createServiceClient } from "@/lib/supabase/service";

export type VenueEmailBrand = VenueBrandAssetSource & {
  id?: string;
  name?: string | null;
  slug?: string | null;
};

/** Display width in the header; encode at 2× for sharper mobile screens. */
const EMAIL_LOGO_DISPLAY_WIDTH_PX = 100;
const EMAIL_LOGO_ENCODE_WIDTH_PX = EMAIL_LOGO_DISPLAY_WIDTH_PX * 2;
/** Keep the inline JPEG small so employee mailboxes download quickly. */
const EMAIL_LOGO_JPEG_QUALITY = 70;

/** Process-lifetime cache keyed by logo path + header band color. */
const headerLogoAttachmentCache = new Map<
  string,
  Promise<SendAppEmailAttachment | null>
>();

function absoluteAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

async function readLocalPublicAsset(url: string): Promise<Buffer | null> {
  const clean = url.split("?")[0] ?? url;
  if (!clean.startsWith("/") || clean.includes("..")) return null;
  const candidates = [
    path.join(process.cwd(), "public", clean),
    path.join(process.cwd(), "apps/web/public", clean),
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

async function loadLogoBytes(logoPath: string): Promise<Buffer | null> {
  if (logoPath.startsWith("data:")) {
    const base64 = logoPath.replace(/^data:[^;]+;base64,/, "");
    return Buffer.from(base64, "base64");
  }
  if (logoPath.startsWith("/")) {
    const local = await readLocalPublicAsset(logoPath);
    if (local) return local;
  }
  try {
    const response = await fetch(absoluteAssetUrl(logoPath));
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Shrink + compress the venue logo for inline email use.
 * Large source assets are resized before encoding so the MIME part stays tiny.
 */
async function prepareEmailHeaderLogoAttachment(params: {
  logoPath: string | null;
  backgroundColor: string;
}): Promise<SendAppEmailAttachment | null> {
  const logoPath = params.logoPath?.trim() || null;
  if (!logoPath) return null;

  const bg = /^#[0-9a-fA-F]{6}$/.test(params.backgroundColor)
    ? params.backgroundColor
    : "#F0F3DD";
  const cacheKey = `${logoPath}::${bg}`;
  const cached = headerLogoAttachmentCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async (): Promise<SendAppEmailAttachment | null> => {
    const input = await loadLogoBytes(logoPath);
    if (!input) return null;

    try {
      const sharp = await loadSharp();
      // Flatten onto the header band so we can use compact JPEG (much smaller
      // than a full-resolution PNG/WebP with alpha).
      const jpeg = await sharp(input, { density: 180 })
        .flatten({ background: bg })
        .resize({
          width: EMAIL_LOGO_ENCODE_WIDTH_PX,
          height: Math.round(EMAIL_LOGO_ENCODE_WIDTH_PX * 0.45),
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: EMAIL_LOGO_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();

      return {
        filename: "venue-logo.jpg",
        content: jpeg.toString("base64"),
        content_type: "image/jpeg",
        content_id: VENUE_EMAIL_HEADER_LOGO_CID,
      };
    } catch {
      return null;
    }
  })();

  headerLogoAttachmentCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch {
    headerLogoAttachmentCache.delete(cacheKey);
    return null;
  }
}

/**
 * Build template email HTML with optional fixed-height header (3 cm) and
 * footer (min 2 cm): centered venue logo on a light-green band, plus footer
 * text. Footer can grow on narrow screens so content stays readable.
 */
export async function buildHrTemplateEmailHtml(params: {
  body: string;
  venue: VenueEmailBrand;
  /** When set, use these chrome settings instead of loading from the venue. */
  chrome?: HrEmailChromeSettings;
}): Promise<{
  html: string;
  inlineAttachments: SendAppEmailAttachment[];
}> {
  const bodyHtml = emailTemplateBodyToHtml(params.body);
  const venueId = String(params.venue.id ?? "").trim();

  if (!venueId) {
    return { html: bodyHtml, inlineAttachments: [] };
  }

  const chrome =
    params.chrome ??
    (await loadEmailChromeForVenue(createServiceClient(), {
      id: venueId,
      slug: params.venue.slug,
      name: params.venue.name,
    }));

  if (!chrome.enabled) {
    return { html: bodyHtml, inlineAttachments: [] };
  }

  const socials = listConfiguredEmailChromeSocials(chrome);

  // Logo + social icons in parallel — socials are pre-baked/cached; logo is
  // compressed once per process for the same path + header color.
  const [logoAttachment, socialResults] = await Promise.all([
    prepareEmailHeaderLogoAttachment({
      logoPath: getVenueLogoUrl(params.venue),
      backgroundColor: chrome.headerBackgroundColor,
    }),
    Promise.all(
      socials.map(async (social) => {
        const iconAttachment = await prepareEmailSocialIconAttachment(
          social.icon,
        );
        if (!iconAttachment) return null;
        return {
          attachment: iconAttachment,
          href: social.href,
          label: social.label,
          iconSrc: `cid:${emailChromeSocialCid(social.icon)}`,
        };
      }),
    ),
  ]);

  const inlineAttachments: SendAppEmailAttachment[] = [];
  if (logoAttachment) inlineAttachments.push(logoAttachment);

  const footerSocials: Array<{ href: string; label: string; iconSrc: string }> =
    [];
  for (const row of socialResults) {
    if (!row) continue;
    inlineAttachments.push(row.attachment);
    footerSocials.push({
      href: row.href,
      label: row.label,
      iconSrc: row.iconSrc,
    });
  }

  const headerHtml = buildEmailChromeHeaderHtml({
    backgroundColor: chrome.headerBackgroundColor,
    logoUrl: logoAttachment ? `cid:${VENUE_EMAIL_HEADER_LOGO_CID}` : null,
    venueName: params.venue.name ?? null,
    logoDisplayWidthPx: EMAIL_LOGO_DISPLAY_WIDTH_PX,
  });
  const footerHtml = buildEmailChromeFooterHtml({
    footerText: chrome.footerText,
    socials: footerSocials,
  });

  return {
    html: wrapEmailBodyWithChrome({
      bodyHtml,
      headerHtml,
      footerHtml,
    }),
    inlineAttachments,
  };
}
