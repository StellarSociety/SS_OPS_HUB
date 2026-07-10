import { DiscountsEntryForm } from "@/components/sales/discounts-entry-form";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import { getVenueSalesTaxSettings } from "@/lib/sales/daily-sales-store";
import { canEditDiscounts } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesDiscountsEntryPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();
  const [records, taxSettings] = await Promise.all([
    listVenueDailyDiscounts(supabase, venue.id),
    getVenueSalesTaxSettings(supabase, venue.id),
  ]);

  const totalTaxPct = totalTaxRateFromSettings(taxSettings);

  return (
    <DiscountsEntryForm
      records={records}
      totalTaxPct={totalTaxPct}
      canEdit={canEditDiscounts(permissions, venue.id)}
    />
  );
}
