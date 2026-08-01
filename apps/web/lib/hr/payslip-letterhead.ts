import type { SupabaseClient } from "@supabase/supabase-js";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_PAYSLIP_LETTERHEAD_SETTINGS,
  DEFAULT_PAYSLIP_FOOTER_DISCLAIMER,
  HR_SETTINGS_KEYS,
  type HrPayslipLetterheadSettings,
} from "@/lib/hr/types";
import { getVenueCompanyStampUrl } from "@/lib/venue/branding";

/** Built-in legal name / address for known venues (pre-settings fallback). */
export function resolvePayslipEmployerHeader(venue: {
  slug?: string | null;
  name?: string | null;
}): { legalName: string; address: string | null } {
  const slug = String(venue.slug ?? "").trim().toLowerCase();
  const name = String(venue.name ?? "").trim() || "Employer";
  if (slug === "orilla" || /orilla/i.test(name)) {
    return {
      legalName: "Orilla Restaurant FZE",
      address: "Hotel Local, Flo.27th, Al Barsha South, JVT, Dubai, UAE.",
    };
  }
  return { legalName: name, address: null };
}

/** Merge stored JSON over empty defaults (no venue-specific fallbacks). */
export function mergePayslipLetterheadSettings(
  partial: Partial<HrPayslipLetterheadSettings> | null | undefined,
): HrPayslipLetterheadSettings {
  const base = DEFAULT_HR_PAYSLIP_LETTERHEAD_SETTINGS;
  const rawStamp = partial?.stampUrl;
  let stampUrl: string | null = base.stampUrl;
  if (rawStamp === null) {
    stampUrl = null;
  } else if (typeof rawStamp === "string") {
    stampUrl = rawStamp.trim() || null;
  }

  const footer = String(
    partial?.footerDisclaimer ?? base.footerDisclaimer,
  ).trim();

  return {
    companyName: String(partial?.companyName ?? base.companyName).trim(),
    companyAddress: String(partial?.companyAddress ?? base.companyAddress).trim(),
    stampUrl,
    footerDisclaimer: footer || DEFAULT_PAYSLIP_FOOTER_DISCLAIMER,
  };
}

/**
 * Fill blank letterhead fields from built-in venue defaults (e.g. Orilla
 * legal name / address / bundled stamp) so PDFs and the settings form stay
 * useful before the venue has saved anything.
 */
export function resolvePayslipLetterheadForVenue(
  settings: HrPayslipLetterheadSettings,
  venue: { slug?: string | null; name?: string | null },
): HrPayslipLetterheadSettings {
  const builtIn = resolvePayslipEmployerHeader(venue);
  const bundledStamp = getVenueCompanyStampUrl({
    slug: String(venue.slug ?? "").trim().toLowerCase(),
  });

  return {
    companyName: settings.companyName || builtIn.legalName,
    companyAddress: settings.companyAddress || builtIn.address || "",
    stampUrl: settings.stampUrl || bundledStamp,
    footerDisclaimer:
      settings.footerDisclaimer.trim() || DEFAULT_PAYSLIP_FOOTER_DISCLAIMER,
  };
}

/** Load + resolve letterhead for PDF generation from any authenticated context. */
export async function loadPayslipLetterheadForVenue(
  supabase: SupabaseClient,
  venue: { id: string; slug?: string | null; name?: string | null },
): Promise<HrPayslipLetterheadSettings> {
  const stored = await getHrVenueSetting<Partial<HrPayslipLetterheadSettings>>(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.payslipLetterhead,
    {},
  );
  return resolvePayslipLetterheadForVenue(
    mergePayslipLetterheadSettings(stored),
    venue,
  );
}
