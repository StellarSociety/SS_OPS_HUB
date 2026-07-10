import { DailySalesEntryForm } from "@/components/sales/daily-sales-entry-form";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { canEditVenueDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesDailyEntryPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();
  const [records, taxSettings] = await Promise.all([
    listVenueDailySales(supabase, venue.id),
    getVenueSalesTaxSettings(supabase, venue.id),
  ]);

  const totalTaxPct = totalTaxRateFromSettings(taxSettings);

  return (
    <DailySalesEntryForm
      records={records}
      totalTaxPct={totalTaxPct}
      canEdit={canEditVenueDaily(permissions, venue.id)}
    />
  );
}
