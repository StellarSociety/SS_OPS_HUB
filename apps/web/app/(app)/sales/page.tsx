import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { SalesModuleShortcuts } from "@/components/sales/sales-module-shortcuts";
import { SalesOverviewCharts } from "@/components/sales/sales-overview-charts";
import { SalesEntryStatusBoxes } from "@/components/sales/sales-entry-status-boxes";
import { SalesSchemaSetupNotice } from "@/components/sales/sales-schema-setup-notice";
import { loadSalesOverviewData } from "@/lib/sales/sales-overview-data";
import { redirect } from "next/navigation";
import {
  canAccessOverview,
  firstAccessibleSalesPath,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { scopedPath } from "@/lib/venue/active-venue";
import { Card } from "@/components/ui/card";

export default async function SalesOverviewPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessOverview(permissions, venue.id)) {
    // Without the Overview grant, send the user to their first accessible sales
    // page rather than showing the dashboards or a dead-end.
    const fallback = firstAccessibleSalesPath(permissions, venue.id);
    if (fallback && fallback !== "/sales") {
      redirect(await scopedPath(fallback));
    }
    return <AccessDeniedBounce />;
  }

  const result = await loadSalesOverviewData(supabase, venue.id);

  if (!result.ok) {
    if (result.reason === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load sales overview
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading overview data. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }

  const { records, totalTaxPct, waiterRecords, tenders, entryStatusDays } =
    result.data;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <SalesModuleShortcuts />
        <hr className="mt-4 border-black/10" />
      </div>

      <SalesEntryStatusBoxes days={entryStatusDays} />

      <hr className="border-black/10" />

      <SalesOverviewCharts
        records={records}
        totalTaxPct={totalTaxPct}
        waiterRecords={waiterRecords}
        tenders={tenders}
      />
    </div>
  );
}
