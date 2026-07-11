import { DiscountsInsightsCharts } from "@/components/sales/discounts-insights-charts";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import { getVenueSalesTaxSettings } from "@/lib/sales/daily-sales-store";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesDiscountsInsightsPage() {
  const { supabase, venue } = await getSalesPageContext();

  try {
    const [records, taxSettings] = await Promise.all([
      listVenueDailyDiscounts(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    return (
      <DiscountsInsightsCharts records={records} totalTaxPct={totalTaxPct} />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/discounts]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load discounts insights
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading discount data for charts. Refresh the page
          or try again in a moment.
        </p>
      </Card>
    );
  }
}
