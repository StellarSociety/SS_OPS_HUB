import { DailySalesEntryForm } from "@/components/sales/daily-sales-entry-form";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { listActiveVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { listVenueDailyTenderTotals } from "@/lib/sales/daily-tender-totals-store";
import { listVenueVouchers } from "@/lib/sales/vouchers-store";
import { loadVoucherCreatorNames } from "@/lib/sales/voucher-user-names";
import {
  canEditVenueDaily,
  canEditVouchers,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SalesDailyEntryPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();
  // Daily Sales permissions are established by the parent layout. Tender rows
  // are read through the trusted server client so newly saved totals are not
  // hidden by an out-of-date RLS/session response during a page reload.
  const tenderTotalsClient = createServiceClient();
  const [records, taxSettings, tenders, waiterRecords, tenderTotals, vouchers] =
    await Promise.all([
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
      listActiveVenueTenders(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      listVenueDailyTenderTotals(tenderTotalsClient, venue.id),
      listVenueVouchers(supabase, venue.id),
    ]);

  const totalTaxPct = totalTaxRateFromSettings(taxSettings);
  const voucherCreatorNames = await loadVoucherCreatorNames(vouchers);

  return (
    <DailySalesEntryForm
      records={records}
      tenders={tenders}
      waiterRecords={waiterRecords}
      tenderTotals={tenderTotals}
      vouchers={vouchers}
      voucherCreatorNames={voucherCreatorNames}
      totalTaxPct={totalTaxPct}
      taxSettings={taxSettings}
      canEdit={canEditVenueDaily(permissions, venue.id)}
      canEditVouchers={canEditVouchers(permissions, venue.id)}
    />
  );
}
