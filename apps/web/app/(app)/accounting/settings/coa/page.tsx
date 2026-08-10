import { CoaSettingsSection } from "@/components/accounting/coa-settings-section";
import { canAdminAccountingSettings } from "@/lib/accounting/permissions";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { listAccounts } from "@/lib/accounting/store";

export default async function AccountingCoaSettingsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();
  const accounts = await listAccounts(supabase);
  const canEdit = canAdminAccountingSettings(permissions, venue.id);

  return <CoaSettingsSection accounts={accounts} canEdit={canEdit} />;
}
