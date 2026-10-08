import { ApAlertsList } from "@/components/accounting/ap-alerts-list";
import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { listApDuplicateGroups } from "@/lib/accounting/ap-duplicates";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessAp } from "@/lib/accounting/permissions";

export default async function ApAlertsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessAp(permissions, venue.id)) {
    return <ApDenied />;
  }

  const groups = await listApDuplicateGroups(supabase, venue.id);
  return <ApAlertsList groups={groups} />;
}
