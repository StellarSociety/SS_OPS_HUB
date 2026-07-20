import { DiscountsEntryForm } from "@/components/sales/discounts-entry-form";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { canEditDiscounts } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";

export default async function SalesDiscountsEntryPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();
  const [records, dailySalesRecords, waiterRecords, taxSettings] =
    await Promise.all([
      listVenueDailyDiscounts(supabase, venue.id),
      listVenueDailySales(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);

  const totalTaxPct = totalTaxRateFromSettings(taxSettings);

  return (
    <DiscountsEntryForm
      records={records}
      dailySalesRecords={dailySalesRecords}
      waiterRecords={waiterRecords}
      totalTaxPct={totalTaxPct}
      canEdit={canEditDiscounts(permissions, venue.id)}
    />
  );
}
