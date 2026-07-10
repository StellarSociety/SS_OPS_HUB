import { DiscountsDataTable } from "@/components/sales/discounts-data-table";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import { getVenueSalesTaxSettings } from "@/lib/sales/daily-sales-store";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import { canEditDiscounts } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesDiscountsDataPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const [records, taxSettings] = await Promise.all([
      listVenueDailyDiscounts(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    return (
      <DiscountsDataTable
        records={records}
        totalTaxPct={totalTaxPct}
        canEdit={canEditDiscounts(permissions, venue.id)}
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/discounts/data]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load discounts
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading the data table. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
