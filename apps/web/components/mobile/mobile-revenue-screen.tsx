"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { SalesEntryStatusBoxes } from "@/components/sales/sales-entry-status-boxes";
import { SalesOverviewCharts } from "@/components/sales/sales-overview-charts";
import { SalesSchemaSetupNotice } from "@/components/sales/sales-schema-setup-notice";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { Card } from "@/components/ui/card";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { SalesOverviewResult } from "@/lib/sales/sales-overview-data";
import type { Venue } from "@/lib/types/database";

type MobileRevenueScreenProps = {
  venue: Venue;
  overview: SalesOverviewResult;
  onSelectTab?: (tab: MobileTabItem) => void;
};

export function MobileRevenueScreen({
  venue,
  overview,
  onSelectTab,
}: MobileRevenueScreenProps) {
  const [chartMount, setChartMount] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setChartMount(1));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-32 pt-14">
        <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
          Revenue
        </h1>
        <p className="mt-1 text-center text-[13px] text-black/50 dark:text-white/50">
          {venue.name}
        </p>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        <div className="mx-auto mt-4 w-full max-w-none space-y-6">
          {overview.ok ? (
            <>
              <SalesEntryStatusBoxes
                days={overview.data.entryStatusDays}
                navigate={false}
                compact
              />

              <hr className="border-black/10 dark:border-white/12" />

              <SalesOverviewCharts
                key={chartMount}
                records={overview.data.records}
                totalTaxPct={overview.data.totalTaxPct}
                waiterRecords={overview.data.waiterRecords}
                tenders={overview.data.tenders}
                compact
              />
            </>
          ) : overview.reason === "schema_missing" ? (
            <SalesSchemaSetupNotice />
          ) : (
            <Card className="p-5">
              <h2 className="font-serif text-xl text-[#3D421F] dark:text-[CanvasText]">
                Could not load sales overview
              </h2>
              <p className="mt-2 text-sm text-black/60 dark:text-white/55">
                Something went wrong loading overview data. Refresh the page or
                try again in a moment.
              </p>
            </Card>
          )}
        </div>
      </div>

      <MobileTabBar
        app="revenue"
        activeId="overview"
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}
