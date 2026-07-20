import { WaitersDailyTotalTable } from "@/components/sales/waiters-daily-total-table";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { listVenueDailyTenderTotals } from "@/lib/sales/daily-tender-totals-store";
import { canAccessDailyVsWaiters } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { listActiveVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { getVenueWaiterSalesSettings } from "@/lib/sales/waiter-sales-settings-store";
import { listActiveVenueWaiters } from "@/lib/sales/waiters-store";
import { Card } from "@/components/ui/card";

export default async function DailyVsWaitersFiguresPage() {
  const { supabase, venue, permissions } = await getSalesPageContext();

  if (!canAccessDailyVsWaiters(permissions, venue.id)) {
    return (
      <Card className="p-6">
        <p className="text-sm text-black/60">
          You do not have access to Daily vs Waiters for this venue.
        </p>
      </Card>
    );
  }

  try {
    const [
      waiters,
      tenders,
      waiterRecords,
      dailyRecords,
      dailyTenderTotals,
      taxSettings,
      waiterSalesSettings,
    ] = await Promise.all([
      listActiveVenueWaiters(supabase, venue.id),
      listActiveVenueTenders(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      listVenueDailySales(supabase, venue.id),
      listVenueDailyTenderTotals(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
      getVenueWaiterSalesSettings(supabase, venue.id),
    ]);

    return (
      <WaitersDailyTotalTable
        waiters={waiters}
        tenders={tenders}
        waiterRecords={waiterRecords}
        dailyRecords={dailyRecords}
        dailyTenderTotals={dailyTenderTotals}
        totalTaxPct={totalTaxRateFromSettings(taxSettings)}
        groupsAddedServiceChargePct={
          waiterSalesSettings.groups_added_service_charge_pct
        }
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error(
      "[sales/daily-vs-waiters/figures-verification]",
      error,
    );

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load Daily vs Waiters
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading the comparison table. Refresh the page or
          try again in a moment.
        </p>
      </Card>
    );
  }
}
