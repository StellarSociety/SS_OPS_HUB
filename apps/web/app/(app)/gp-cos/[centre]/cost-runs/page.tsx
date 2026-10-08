import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CosCentreHeader } from "@/components/sales/cos/cos-centre-header";
import { Card } from "@/components/ui/card";
import { CostRunsPanel } from "@/components/sales/cos/cost-runs-panel";
import {
  getCosPageContext,
  canViewCos,
  canEditCos,
} from "@/lib/sales/cos-page-context";
import {
  listVenueCosRuns,
  getVenueCosSettings,
  listVenueCosMonthlyTargets,
  resolveCosTargets,
  isCosSchemaMissingError,
} from "@/lib/sales/cos-store";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import { cosWeekForDate, cosWeekRange } from "@/lib/sales/cos-overview-data";
import { getCosLiveWeeks, isCosRunStale } from "@/lib/sales/cos-live-figures";

function isCostCentre(value: string): value is CostCentre {
  return (COST_CENTRES as readonly string[]).includes(value);
}

export default async function CostRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ centre: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { centre } = await params;
  if (!isCostCentre(centre)) notFound();

  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  const { year } = await searchParams;
  const today = dubaiTodayIso();
  const fiscalYear = Number(year) || new Date().getFullYear();

  let loaded:
    | {
        ok: true;
        runs: Awaited<ReturnType<typeof listVenueCosRuns>>;
        targetCostPct: number;
        targetByMonth: number[];
      }
    | { ok: false; kind: "schema" | "error" };
  try {
    const [runs, settings] = await Promise.all([
      listVenueCosRuns(supabase, venue.id, centre, fiscalYear),
      getVenueCosSettings(supabase, venue.id, centre),
    ]);
    const monthly = await listVenueCosMonthlyTargets(supabase, venue.id, {
      costCentre: centre,
      fiscalYear,
    });
    const targetByMonth = Array.from(
      { length: 12 },
      (_, m) =>
        resolveCosTargets(
          settings,
          monthly.find((t) => t.month_index === m),
        ).targetCostPct,
    );
    loaded = {
      ok: true,
      runs,
      targetCostPct: settings?.target_cost_pct ?? 27,
      targetByMonth,
    };
  } catch (error) {
    if (isCosSchemaMissingError(error as { code?: string; message?: string })) {
      loaded = { ok: false, kind: "schema" };
    } else {
      console.error("[gp-cos/cost-runs]", error);
      loaded = { ok: false, kind: "error" };
    }
  }

  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <CosCentreHeader
          centre={centre}
          section="cost-runs"
          subtitle={venue.name}
        />
        <Card className="p-6">
          {loaded.kind === "schema" ? (
            <>
              <h2 className="font-serif text-xl text-[#3D421F]">
                Database setup required
              </h2>
              <p className="mt-2 text-sm text-black/60">
                The GP &amp; COS tables haven&apos;t been created yet. Run the
                migration <code>20261007040000_gp_cos_module.sql</code> and reload.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-serif text-xl text-[#3D421F]">
                Could not load cost runs
              </h2>
              <p className="mt-2 text-sm text-black/60">
                Something went wrong. Refresh the page or try again in a moment.
              </p>
            </>
          )}
        </Card>
      </div>
    );
  }

  // Weeks whose saved figures differ from Revenue / Accounts right now.
  let staleWeeks: number[] = [];
  try {
    const lastWeek = Math.max(0, ...loaded.runs.map((r) => r.week_no));
    const live = await getCosLiveWeeks(supabase, venue.id, centre, fiscalYear, lastWeek);
    staleWeeks = loaded.runs
      .filter((r) => isCosRunStale(r, live.get(r.week_no)))
      .map((r) => r.week_no);
  } catch (error) {
    console.error("[gp-cos/cost-runs] live figures:", error);
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <CosCentreHeader
        centre={centre}
        section="cost-runs"
        subtitle={
          <>
            Weekly cost of sales &amp; gross profit — {venue.name} ·{" "}
            {fiscalYear}
          </>
        }
      />

      <CostRunsPanel
        costCentre={centre}
        fiscalYear={fiscalYear}
        runs={loaded.runs}
        staleWeeks={staleWeeks}
        targetCostPct={loaded.targetCostPct}
        targetByMonth={loaded.targetByMonth}
        canEdit={canEditCos(permissions, venue.id)}
        weekRanges={Array.from({ length: 52 }, (_, i) => ({
          weekNo: i + 1,
          ...cosWeekRange(fiscalYear, i + 1),
        }))}
        today={today}
        todayWeek={cosWeekForDate(fiscalYear, today)}
      />
    </div>
  );
}
