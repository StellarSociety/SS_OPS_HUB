import { DimensionsSettingsSection } from "@/components/accounting/dimensions-settings-section";
import { canAdminAccountingSettings } from "@/lib/accounting/permissions";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import {
  listDimensionRequirements,
  listDimensions,
} from "@/lib/accounting/store";

export default async function AccountingDimensionsSettingsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();
  const [dimensions, requirements] = await Promise.all([
    listDimensions(supabase),
    listDimensionRequirements(supabase),
  ]);
  const canEdit = canAdminAccountingSettings(permissions, venue.id);

  return (
    <DimensionsSettingsSection
      dimensions={dimensions}
      requirements={requirements}
      canEdit={canEdit}
    />
  );
}
