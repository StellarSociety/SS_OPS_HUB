import { VisaProvidersTable } from "@/components/hr/visa-providers-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadVisaDetailsPage } from "@/lib/hr/visa-store";

export default async function VisaDetailsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const { providers } = await loadVisaDetailsPage(supabase, venue.id);

  return (
    <VisaProvidersTable providers={providers} canManage={canManage} />
  );
}
