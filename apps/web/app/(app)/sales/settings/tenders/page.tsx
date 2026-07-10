import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";
import { SalesTendersSettingsPanel } from "@/components/sales/sales-tenders-settings-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { listVenueTenders } from "@/lib/sales/tenders-store";
import {
  canAccessSalesWaitersSettings,
  canManageSalesWaiters,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesTendersSettingsPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessSalesWaitersSettings(permissions, venue.id)) {
    return (
      <>
        <SalesSettingsSubNav />
        <p className="text-sm text-black/60">
          You do not have access to tender settings for this venue.
        </p>
      </>
    );
  }

  try {
    const tenders = await listVenueTenders(supabase, venue.id);

    return (
      <>
        <SalesSettingsSubNav />
        <SalesTendersSettingsPanel
          tenders={tenders}
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
            Could not load tenders
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading tender settings.
          </p>
        </Card>
      </>
    );
  }
}
