import { VisaEmployeesTable } from "@/components/hr/visa-employees-table";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { getHrPageContext } from "@/lib/hr/page-context";
import { loadPayslipLetterheadForVenue } from "@/lib/hr/payslip-letterhead";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadVisaEmployeesPage } from "@/lib/hr/visa-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function VisaEmployeesPage() {
  const { supabase, venue, permissions, user } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const [data, profileResult, letterhead] = await Promise.all([
    loadVisaEmployeesPage(supabase, venue.id),
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    loadPayslipLetterheadForVenue(supabase, venue),
  ]);

  const userDisplayName = buildExportUserLabel(
    profileResult.data?.full_name,
    profileResult.data?.email ?? user.email,
  );

  return (
    <VisaEmployeesTable
      rows={data.rows}
      departments={data.departments}
      employmentStatuses={data.statuses}
      workingStatuses={data.workingStatuses}
      providers={data.providers}
      venueId={venue.id}
      venueName={venue.name ?? "Venue"}
      venueAddress={letterhead.companyAddress || null}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
      canManage={canManage}
    />
  );
}
