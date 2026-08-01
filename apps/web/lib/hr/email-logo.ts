import "server-only";

import type { SendAppEmailAttachment } from "@/lib/email/transport/types";
import {
  emailTemplateBodyToHtml,
  type EmailTemplateHtmlOptions,
} from "@/lib/hr/email-message-format";
import { loadPayslipPdfLogoServer } from "@/lib/hr/payslip-pdf-logo-server";
import {
  getVenueLogoUrl,
  type VenueBrandAssetSource,
} from "@/lib/venue/branding";

/** Stable Content-ID for the venue logo footer image. */
export const VENUE_EMAIL_LOGO_CID = "venue-logo@ss-ops-hub";

export type VenueEmailBrand = VenueBrandAssetSource & {
  name?: string | null;
};

/**
 * Build template email HTML with an automatic company-logo footer.
 * Rasterizes SVG/WebP logos to PNG and embeds via CID for email-client support.
 */
export async function buildHrTemplateEmailHtml(params: {
  body: string;
  venue: VenueEmailBrand;
  htmlOptions?: Omit<EmailTemplateHtmlOptions, "logoUrl" | "venueName">;
}): Promise<{
  html: string;
  inlineAttachments: SendAppEmailAttachment[];
}> {
  const logoPath = getVenueLogoUrl(params.venue);
  const logo = await loadPayslipPdfLogoServer(logoPath);

  const inlineAttachments: SendAppEmailAttachment[] = [];
  let logoUrl: string | null = null;

  if (logo) {
    const base64 = logo.dataUrl.replace(/^data:[^;]+;base64,/, "");
    inlineAttachments.push({
      filename: "venue-logo.png",
      content: base64,
      content_type: "image/png",
      content_id: VENUE_EMAIL_LOGO_CID,
    });
    logoUrl = `cid:${VENUE_EMAIL_LOGO_CID}`;
  }

  return {
    html: emailTemplateBodyToHtml(params.body, {
      ...params.htmlOptions,
      logoUrl,
      venueName: params.venue.name ?? null,
    }),
    inlineAttachments,
  };
}
