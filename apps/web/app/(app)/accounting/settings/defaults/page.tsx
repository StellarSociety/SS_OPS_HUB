import { DefaultsSettingsSection } from "@/components/accounting/defaults-settings-section";
import { canAdminAccountingSettings } from "@/lib/accounting/permissions";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import {
  listAccounts,
  listSystemDefaultAccounts,
} from "@/lib/accounting/store";

export default async function AccountingDefaultsSettingsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();
  const [defaults, accounts] = await Promise.all([
    listSystemDefaultAccounts(supabase),
    listAccounts(supabase),
  ]);
  const canEdit = canAdminAccountingSettings(permissions, venue.id);

  return (
    <DefaultsSettingsSection
      defaults={defaults}
      accounts={accounts}
      canEdit={canEdit}
    />
  );
}
