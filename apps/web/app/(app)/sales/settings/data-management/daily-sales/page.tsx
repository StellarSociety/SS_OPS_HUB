import { DailySalesImportPanel } from "@/components/sales/daily-sales-import-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { listVenueDailySales } from "@/lib/sales/daily-sales-store";
import { canEditVenueDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function DailySalesDataManagementPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const records = await listVenueDailySales(supabase, venue.id);

    return (
      <DailySalesImportPanel
        venueName={venue.name}
        canEdit={canEditVenueDaily(permissions, venue.id)}
        records={records}
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/settings/data-management/daily-sales]", error);

    return (
      <Card className="p-6">
        <h3 className="font-serif text-xl text-[#3D421F]">
          Could not load daily sales import
        </h3>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading daily sales data for import. Refresh the
          page or try again in a moment.
        </p>
      </Card>
    );
  }
}
