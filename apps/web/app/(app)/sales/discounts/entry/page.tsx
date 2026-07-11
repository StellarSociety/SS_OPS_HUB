import { DiscountsEntryForm } from "@/components/sales/discounts-entry-form";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { canEditDiscounts } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesDiscountsEntryPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();
  const [records, dailySalesRecords, taxSettings] = await Promise.all([
    listVenueDailyDiscounts(supabase, venue.id),
    listVenueDailySales(supabase, venue.id),
    getVenueSalesTaxSettings(supabase, venue.id),
  ]);

  const totalTaxPct = totalTaxRateFromSettings(taxSettings);

  return (
    <DiscountsEntryForm
      records={records}
      dailySalesRecords={dailySalesRecords}
      totalTaxPct={totalTaxPct}
      canEdit={canEditDiscounts(permissions, venue.id)}
    />
  );
}
