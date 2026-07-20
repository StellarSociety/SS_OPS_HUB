import { WaiterSalesDataTable } from "@/components/sales/waiter-sales-data-table";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import { getVenueSalesTaxSettings } from "@/lib/sales/daily-sales-store";
import { listActiveVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { getVenueWaiterSalesSettings } from "@/lib/sales/waiter-sales-settings-store";
import { listActiveVenueWaiters } from "@/lib/sales/waiters-store";
import { canEditWaiterDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesWaiterDataPage() {
  const { permissions, venue, supabase } = await getSalesPageContext();

  try {
    const [waiters, tenders, records, taxSettings, waiterSalesSettings] =
      await Promise.all([
        listActiveVenueWaiters(supabase, venue.id),
        listActiveVenueTenders(supabase, venue.id),
        listVenueWaiterDailySales(supabase, venue.id),
        getVenueSalesTaxSettings(supabase, venue.id),
        getVenueWaiterSalesSettings(supabase, venue.id),
      ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    return (
      <WaiterSalesDataTable
        waiters={waiters}
        tenders={tenders}
        records={records}
        totalTaxPct={totalTaxPct}
        groupsAddedServiceChargePct={
          waiterSalesSettings.groups_added_service_charge_pct
        }
        canEdit={canEditWaiterDaily(permissions, venue.id)}
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/waiter/data]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load waiter sales data
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading the data table. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
