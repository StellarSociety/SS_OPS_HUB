import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";
import { SalesWaitersSettingsPanel } from "@/components/sales/sales-waiters-settings-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { listVenueWaiters } from "@/lib/sales/waiters-store";
import {
  canAccessSalesSettings,
  canManageSalesWaiters,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesWaitersSettingsPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessSalesSettings(permissions, venue.id)) {
    return (
      <>
        <SalesSettingsSubNav />
        <p className="text-sm text-black/60">
          You do not have access to waiter settings for this venue.
        </p>
      </>
    );
  }

  try {
    const waiters = await listVenueWaiters(supabase, venue.id);

    return (
      <>
        <SalesSettingsSubNav />
        <SalesWaitersSettingsPanel
          waiters={waiters}
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
            Could not load waiters
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading the waiter roster.
          </p>
        </Card>
      </>
    );
  }
}
