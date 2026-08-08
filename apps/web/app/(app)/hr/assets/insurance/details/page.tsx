import { InsuranceProvidersTable } from "@/components/hr/insurance-providers-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import {
  loadInsuranceCategoryPositionHints,
  loadInsuranceDetailsPage,
} from "@/lib/hr/insurance-store";
import { listDepartments, listPositions } from "@/lib/hr/store";

export default async function InsuranceDetailsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const [{ providers }, departments, positions, categoryPositionHints] =
    await Promise.all([
      loadInsuranceDetailsPage(supabase),
      listDepartments(supabase, venue.id),
      listPositions(supabase, venue.id),
      loadInsuranceCategoryPositionHints(supabase, venue.id),
    ]);

  return (
    <InsuranceProvidersTable
      providers={providers}
      departments={departments}
      positions={positions}
      categoryPositionHints={categoryPositionHints}
      canManage={canManage}
    />
  );
}
