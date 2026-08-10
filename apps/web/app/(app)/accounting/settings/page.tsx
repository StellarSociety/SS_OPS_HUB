import { EntitiesSettingsSection } from "@/components/accounting/entities-settings-section";
import { canAdminAccountingSettings } from "@/lib/accounting/permissions";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import {
  listFiscalPeriods,
  listLegalEntities,
  listVenueEntities,
  listVenuesForMapping,
} from "@/lib/accounting/store";
import type { FiscalPeriod } from "@/lib/accounting/types";

export default async function AccountingEntitiesSettingsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();
  const canEdit = canAdminAccountingSettings(permissions, venue.id);

  const [entities, venueEntities, venues] = await Promise.all([
    listLegalEntities(supabase),
    listVenueEntities(supabase),
    listVenuesForMapping(supabase),
  ]);

  const periodsByEntity: Record<string, FiscalPeriod[]> = {};
  await Promise.all(
    entities.map(async (e) => {
      periodsByEntity[e.id] = await listFiscalPeriods(supabase, e.id);
    }),
  );

  return (
    <EntitiesSettingsSection
      entities={entities}
      venueEntities={venueEntities}
      venues={venues}
      periodsByEntity={periodsByEntity}
      canEdit={canEdit}
    />
  );
}
