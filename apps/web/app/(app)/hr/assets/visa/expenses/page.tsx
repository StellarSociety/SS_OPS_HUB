import { VisaExpensesPanel } from "@/components/hr/visa-expenses-panel";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import {
  loadVisaEmployeesPage,
  loadVisaExpensesPage,
} from "@/lib/hr/visa-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function VisaExpensesPage() {
  const { supabase, venue, permissions, user } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const [expenses, employees, profileResult] = await Promise.all([
    loadVisaExpensesPage(supabase, venue.id),
    loadVisaEmployeesPage(supabase, venue.id),
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
    <VisaExpensesPanel
      months={expenses.months}
      employeeRows={employees.rows}
      canManage={canManage}
      venueName={venue.name ?? "Venue"}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
    />
  );
}
