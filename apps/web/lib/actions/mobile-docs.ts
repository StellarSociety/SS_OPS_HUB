"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import type { PayslipSnapshot } from "@/lib/actions/hr-payroll";
import { canViewPayslips } from "@/lib/hr/permissions";
import { loadPayslipLetterheadForVenue } from "@/lib/hr/payslip-letterhead";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export async function getMobilePayslipSnapshotAction(input: {
  payslipId: string;
  previewStaffId?: string | null;
}): Promise<
  | {
      ok: true;
      snapshot: PayslipSnapshot;
      venueLogoUrl: string | null;
      venueStampUrl: string | null;
    }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const { user, venue, permissions } = auth;
  if (!canAccessMobileApp(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const payslipId = input.payslipId.trim();
  if (!payslipId) return { ok: false, error: "Payslip is required." };

  const service = createServiceClient();
  const { data, error } = await service
    .from("hr_payslips")
    .select("id, staff_id, snapshot")
    .eq("id", payslipId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (error || !data?.snapshot) {
    return { ok: false, error: error?.message ?? "Payslip not found." };
  }

  const { data: profile } = await service
    .from("profiles")
    .select("staff_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownStaffId =
    (profile?.staff_id as string | null | undefined)?.trim() || null;
  const payslipStaffId = String(data.staff_id ?? "").trim();
  const previewStaffId = input.previewStaffId?.trim() || null;
  const allowed =
    (ownStaffId && ownStaffId === payslipStaffId) ||
    (previewStaffId && previewStaffId === payslipStaffId) ||
    canViewPayslips(permissions, venue.id);

  if (!allowed) {
    return { ok: false, error: "No permission." };
  }

  const snapshot = data.snapshot as PayslipSnapshot;
  const letterhead = await loadPayslipLetterheadForVenue(service, venue);

  return {
    ok: true,
    snapshot: {
      ...snapshot,
      employer: {
        ...snapshot.employer,
        legalName: snapshot.employer?.legalName ?? letterhead.companyName,
        companyAddress:
          snapshot.employer?.companyAddress ??
          (letterhead.companyAddress || null),
        footerDisclaimer:
          snapshot.employer?.footerDisclaimer ?? letterhead.footerDisclaimer,
      },
    },
    venueLogoUrl: getVenueLogoUrl({
      slug: venue.slug,
      logo_url: venue.logo_url,
      icon_url: venue.icon_url,
      favicon_url: venue.favicon_url,
    }),
    venueStampUrl: letterhead.stampUrl,
  };
}

export async function loadMobileDocsPageAction(input: {
  venueId: string;
  previewStaffId?: string | null;
}) {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return null;

  const previewStaffId = input.previewStaffId?.trim() || null;
  const { loadMobileEmployeeDocsPage, loadMobileStaffDocsPage } = await import(
    "@/lib/mobile/employee-docs"
  );

  if (previewStaffId) {
    return loadMobileStaffDocsPage({
      staffId: previewStaffId,
      venueId: access.venueId,
    });
  }

  return loadMobileEmployeeDocsPage({
    userId: access.userId,
    venueId: access.venueId,
  });
}
