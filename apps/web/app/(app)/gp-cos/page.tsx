import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { Card } from "@/components/ui/card";
import { CosOverviewDashboard } from "@/components/sales/cos/cos-overview-dashboard";
import { getCosPageContext, canViewCos } from "@/lib/sales/cos-page-context";
import {
  getCosOverviewData,
  cosWeekForDate,
} from "@/lib/sales/cos-overview-data";
import { listVenueCosSettings } from "@/lib/sales/cos-store";
import { monthIndexForWeek } from "@/lib/sales/cos-calculations";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";

export default async function GpCosOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    year?: string;
    week?: string;
    month?: string;
  }>;
}) {
  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const fiscalYear = Number(sp.year) || new Date().getFullYear();
  const defaultWeek = cosWeekForDate(fiscalYear, today);
  const weekNo = Number(sp.week) || defaultWeek;
  const monthIndex =
    sp.month != null ? Number(sp.month) : monthIndexForWeek(weekNo);
  const scope = (sp.scope as "week" | "month" | "year") || "week";

  let data: Awaited<ReturnType<typeof getCosOverviewData>> | null = null;
  let failed = false;
  try {
    const [overview, settings] = await Promise.all([
      getCosOverviewData(supabase, venue.id, fiscalYear, scope, weekNo, monthIndex),
      listVenueCosSettings(supabase, venue.id),
    ]);
    for (const s of settings) {
      if ((COST_CENTRES as readonly string[]).includes(s.cost_centre)) {
        overview.targetByCentre[s.cost_centre as CostCentre] = s.target_cost_pct;
      }
    }
    data = overview;
  } catch (e) {
    console.error("[gp-cos/overview]", e);
    failed = true;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>GP &amp; COS — Overview</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Weekly cost of sales &amp; gross profit report — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {failed || !data ? (
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load the overview
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Refresh the page or try again in a moment.
          </p>
        </Card>
      ) : (
        <CosOverviewDashboard data={data} />
      )}
    </div>
  );
}
