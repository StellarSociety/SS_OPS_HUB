import { InsuranceExpensesPanel } from "@/components/hr/insurance-expenses-panel";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import {
  loadInsuranceEmployeesPage,
  loadInsuranceExpensesPage,
} from "@/lib/hr/insurance-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function InsuranceExpensesPage() {
  const { supabase, venue, permissions, user } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const [expenses, employees, profileResult] = await Promise.all([
    loadInsuranceExpensesPage(supabase, venue.id),
    loadInsuranceEmployeesPage(supabase, venue.id),
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
    <InsuranceExpensesPanel
      months={expenses.months}
      employeeRows={employees.rows}
      categories={employees.categories}
      canManage={canManage}
      venueName={venue.name ?? "Venue"}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
    />
  );
}
