import { DailySalesDataTable } from "@/components/sales/daily-sales-data-table";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { canEditVenueDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesDailyDataPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const [records, taxSettings] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    return (
    <DailySalesDataTable
      records={records}
      totalTaxPct={totalTaxPct}
      canEdit={canEditVenueDaily(permissions, venue.id)}
    />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/daily/data]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load daily sales
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading the data table. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
