import { SequencesSettingsSection } from "@/components/accounting/sequences-settings-section";
import { canAdminAccountingSettings } from "@/lib/accounting/permissions";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { listLegalEntities, listSequences } from "@/lib/accounting/store";

export default async function AccountingSequencesSettingsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();
  const [entities, sequences] = await Promise.all([
    listLegalEntities(supabase),
    listSequences(supabase),
  ]);
  const canEdit = canAdminAccountingSettings(permissions, venue.id);

  return (
    <SequencesSettingsSection
      entities={entities}
      sequences={sequences}
      canEdit={canEdit}
    />
  );
}
