import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";
import { SalesTaxSettingsPanel } from "@/components/sales/sales-tax-settings-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { getVenueSalesTaxSettings } from "@/lib/sales/daily-sales-store";
import { canEditVenueDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesTaxSettingsPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const settings = await getVenueSalesTaxSettings(supabase, venue.id);

    return (
      <>
        <SalesSettingsSubNav />
        <SalesTaxSettingsPanel
          settings={settings}
          canEdit={canEditVenueDaily(permissions, venue.id)}
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
            Could not load tax settings
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading sales tax settings.
          </p>
        </Card>
      </>
    );
  }
}
