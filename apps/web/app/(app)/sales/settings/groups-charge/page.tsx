import { SalesGroupsServiceChargeSettingsPanel } from "@/components/sales/sales-groups-service-charge-settings-panel";
import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { getVenueWaiterSalesSettings } from "@/lib/sales/waiter-sales-settings-store";
import { canManageSalesWaiters } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesGroupsServiceChargeSettingsPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const settings = await getVenueWaiterSalesSettings(supabase, venue.id);

    return (
      <>
        <SalesSettingsSubNav />
        <SalesGroupsServiceChargeSettingsPanel
          settings={settings}
          canEdit={canManageSalesWaiters(permissions, venue.id)}
        />
      </>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return (
        <>
          <SalesSettingsSubNav />
          <SalesSchemaSetupNotice />
        </>
      );
    }

    return (
      <>
        <SalesSettingsSubNav />
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load groups service charge settings
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading waiter sales settings.
          </p>
        </Card>
      </>
    );
  }
}
