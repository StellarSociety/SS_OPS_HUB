import { WaiterSalesInsightsCharts } from "@/components/sales/waiter-sales-insights-charts";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { listActiveVenueWaiters } from "@/lib/sales/waiters-store";
import { Card } from "@/components/ui/card";

export default async function SalesWaiterInsightsPage() {
  const { venue, supabase } = await getSalesPageContext();

  try {
    const [entries, waiters] = await Promise.all([
      listVenueWaiterDailySales(supabase, venue.id),
      listActiveVenueWaiters(supabase, venue.id),
    ]);

    return <WaiterSalesInsightsCharts entries={entries} waiters={waiters} />;
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/waiter/insights]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load waiter insights
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading waiter sales data for charts. Refresh the
          page or try again in a moment.
        </p>
      </Card>
    );
  }
}
