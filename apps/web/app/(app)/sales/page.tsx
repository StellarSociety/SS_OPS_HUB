import { SalesModuleShortcuts } from "@/components/sales/sales-module-shortcuts";
import { SalesOverviewCharts } from "@/components/sales/sales-overview-charts";
import { SalesEntryStatusBoxes } from "@/components/sales/sales-entry-status-boxes";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { listVenueWaiters } from "@/lib/sales/waiters-store";
import { listActiveVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueDailySnapReportStatus } from "@/lib/sales/daily-snap-store";
import {
  buildSalesEntryStatusDays,
  getSalesEntryStatusDates,
  type SnapReportStatusForDay,
} from "@/lib/sales/sales-entry-status";
import { canAccessSalesModule } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesOverviewPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessSalesModule(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Sales &amp; Revenue for this venue.
        </p>
      </div>
    );
  }

  try {
    const statusDates = getSalesEntryStatusDates(6);
    const [
      records,
      taxSettings,
      waiterRecords,
      waiters,
      tenders,
      discountsRecords,
      snapReportStatus,
    ] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      listVenueWaiters(supabase, venue.id),
      listActiveVenueTenders(supabase, venue.id),
      listVenueDailyDiscounts(supabase, venue.id),
      listVenueDailySnapReportStatus(supabase, venue.id, statusDates),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    const editorIds = Array.from(
      new Set(
        Array.from(snapReportStatus.values())
          .map((status) => status.lastEditorId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const editorNameById = new Map<string, string>();
    if (editorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", editorIds);
      for (const profile of profiles ?? []) {
        const name =
          (profile.full_name as string | null)?.trim() ||
          (profile.email as string | null)?.trim() ||
          null;
        if (name) editorNameById.set(profile.id as string, name);
      }
    }

    const snapStatusByDate = new Map<string, SnapReportStatusForDay>();
    for (const [date, status] of snapReportStatus) {
      snapStatusByDate.set(date, {
        hasReport: status.hasReport,
        editorName: status.lastEditorId
          ? editorNameById.get(status.lastEditorId) ?? null
          : null,
      });
    }

    const entryStatusDays = buildSalesEntryStatusDays({
      dailyRecords: records,
      waiterRecords,
      waiters,
      discountsRecords,
      snapStatusByDate,
      totalTaxPct,
      count: 6,
    });

    return (
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <SalesModuleShortcuts />
          <hr className="mt-4 border-black/10" />
        </div>

        <SalesOverviewCharts
          records={records}
          totalTaxPct={totalTaxPct}
          waiterRecords={waiterRecords}
          tenders={tenders}
        />

        <hr className="border-black/10" />

        <SalesEntryStatusBoxes days={entryStatusDays} />
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/overview]", error);

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
}
