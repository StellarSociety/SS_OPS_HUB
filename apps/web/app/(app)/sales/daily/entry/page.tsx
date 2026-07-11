import { DailySalesEntryForm } from "@/components/sales/daily-sales-entry-form";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { listActiveVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { listVenueDailyTenderTotals } from "@/lib/sales/daily-tender-totals-store";
import { canEditVenueDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesDailyEntryPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();
  const [records, taxSettings, tenders, waiterRecords, tenderTotals] =
    await Promise.all([
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
      listActiveVenueTenders(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      listVenueDailyTenderTotals(supabase, venue.id),
    ]);

  const totalTaxPct = totalTaxRateFromSettings(taxSettings);

  return (
    <DailySalesEntryForm
      records={records}
      tenders={tenders}
      waiterRecords={waiterRecords}
      tenderTotals={tenderTotals}
      totalTaxPct={totalTaxPct}
      taxSettings={taxSettings}
      canEdit={canEditVenueDaily(permissions, venue.id)}
    />
  );
}
