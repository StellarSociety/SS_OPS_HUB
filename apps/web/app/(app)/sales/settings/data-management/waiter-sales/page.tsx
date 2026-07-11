import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { WaiterSalesImportPanel } from "@/components/sales/waiter-sales-import-panel";
import { canEditWaiterDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { listVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueWaiters } from "@/lib/sales/waiters-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { Card } from "@/components/ui/card";

export default async function WaiterSalesDataManagementPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const [records, waiters, tenders] = await Promise.all([
      listVenueWaiterDailySales(supabase, venue.id),
      listVenueWaiters(supabase, venue.id),
      listVenueTenders(supabase, venue.id),
    ]);

    return (
      <WaiterSalesImportPanel
        venueName={venue.name}
        canEdit={canEditWaiterDaily(permissions, venue.id)}
        records={records}
        waiters={waiters}
        tenders={tenders.filter((tender) => tender.status === "active")}
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/settings/data-management/waiter-sales]", error);

    return (
      <Card className="p-6">
        <h3 className="font-serif text-xl text-[#3D421F]">
          Could not load waiter sales import
        </h3>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading waiter sales data for import. Refresh the
          page or try again in a moment.
        </p>
      </Card>
    );
  }
}
