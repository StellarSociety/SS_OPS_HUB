import { CertificationsExpensesPanel } from "@/components/hr/certifications-expenses-panel";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import {
  loadCertificationsEmployeesPage,
  loadCertificationsExpensesPage,
} from "@/lib/hr/certifications-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function CertificationsExpensesPage() {
  const { supabase, venue, permissions, user } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const [expenses, employees, profileResult] = await Promise.all([
    loadCertificationsExpensesPage(supabase, venue.id),
    loadCertificationsEmployeesPage(supabase, venue.id),
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const userDisplayName = buildExportUserLabel(
    profileResult.data?.full_name,
    profileResult.data?.email ?? user.email,
  );

  return (
    <CertificationsExpensesPanel
      months={expenses.months}
      employeeRows={employees.rows}
      types={employees.types}
      canManage={canManage}
      venueName={venue.name ?? "Venue"}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
    />
  );
}
