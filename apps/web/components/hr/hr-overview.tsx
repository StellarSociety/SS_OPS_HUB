import { Building2, Globe, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ContinentBreakdownChart } from "@/components/hr/continent-breakdown-chart";
import { OffBoardingWidgets } from "@/components/hr/offboarding-widgets";
import { ProbationWidgets } from "@/components/hr/probation-widgets";
import type { HrBreakdownRow, HrOverviewStats } from "@/lib/hr/overview";
import type { OffBoardingItem } from "@/lib/hr/offboarding";
import type { OnProbationItem } from "@/lib/hr/probation";
import { cn } from "@/lib/utils";

type HrOverviewProps = {
  stats: HrOverviewStats;
  /** When set, renders Off boarding (and an empty On Boarding slot before it). */
  offBoarding?: OffBoardingItem[];
  /** When set, renders as a panel after On Boarding. */
  onProbation?: OnProbationItem[];
};

function CountPercent({
  count,
  percent,
}: {
  count: number;
  percent: number;
}) {
  return (
    <span className="grid w-[4.75rem] shrink-0 grid-cols-[1fr_auto_2.25rem] items-baseline gap-x-1 text-xs tabular-nums text-[#3D421F]">
      <span className="text-right font-semibold">{count}</span>
      <span className="text-black/30" aria-hidden>
        |
      </span>
      <span className="text-right text-black/45">{percent}%</span>
    </span>
  );
}

function BreakdownCard({
  icon: Icon,
  title,
  rows,
  emptyLabel,
}: {
  icon: LucideIcon;
  title: string;
  rows: HrBreakdownRow[];
  emptyLabel: string;
}) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const totalPercent = total > 0 ? 100 : 0;

  return (
    <Card className="flex h-full min-h-[17.5rem] flex-col p-4">
      <div className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 shrink-0 text-[#3D421F]/70" aria-hidden />
        <h3 className="font-serif text-base text-[#3D421F]">{title}</h3>
      </div>
      <hr className="mt-2 shrink-0 border-t-2 border-black/15" />
      {rows.length > 0 ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col justify-between">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs font-medium text-black/60">
                {row.label}
              </span>
              <div className="relative h-2 min-w-0 flex-1 rounded-full bg-black/[0.05]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--venue-primary)]/55"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
              <CountPercent count={row.count} percent={row.percent} />
            </div>
          ))}
          <div className="flex items-center gap-3 border-t border-black/10 pt-2">
            <span className="w-28 shrink-0 text-xs font-semibold text-[#3D421F]">
              Total
            </span>
            <div className="min-w-0 flex-1" />
            <CountPercent count={total} percent={totalPercent} />
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 items-center justify-center text-xs text-black/45">
          {emptyLabel}
        </div>
      )}
    </Card>
  );
}

/** Placeholder panel — same chrome as Off boarding; content TBD. */
function OnBoardingPanel() {
  return (
    <Card className="flex h-full min-h-[17.5rem] flex-col p-4">
      <div className="flex items-center gap-1.5">
        <UserPlus
          className="h-4 w-4 shrink-0 text-emerald-600/80"
          aria-hidden
        />
        <h3 className="min-w-0 flex-1 truncate font-serif text-base text-[#3D421F]">
          On Boarding
        </h3>
        <span className="shrink-0 text-xs tabular-nums text-black/50">0</span>
      </div>
      <hr className="mt-2 shrink-0 border-t-2 border-black/15" />
      <div className="mt-3 flex flex-1 items-center justify-center text-xs text-black/45">
        No upcoming joins
      </div>
    </Card>
  );
}

export function HrOverview({
  stats,
  offBoarding,
  onProbation,
}: HrOverviewProps) {
  const showOffBoarding = offBoarding != null;
  const showProbation = onProbation != null;
  const boardingCount =
    (showOffBoarding ? 2 : 0) + (showProbation ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BreakdownCard
          icon={Building2}
          title="Headcount by Department"
          rows={stats.byDepartment}
          emptyLabel="No department data"
        />
        <ContinentBreakdownChart rows={stats.byContinent} />
        <BreakdownCard
          icon={Globe}
          title="Top Nationalities"
          rows={stats.byNationality}
          emptyLabel="No nationality data"
        />
      </div>

      {boardingCount > 0 ? (
        <div
          className={cn(
            "grid w-full gap-4",
            boardingCount >= 3
              ? "sm:grid-cols-2 lg:grid-cols-3"
              : boardingCount === 2
                ? "sm:grid-cols-2"
                : "max-w-sm",
          )}
        >
          {showOffBoarding ? <OnBoardingPanel /> : null}
          {showProbation ? (
            <ProbationWidgets
              items={onProbation}
              title="On probation"
              variant="panel"
            />
          ) : null}
          {showOffBoarding ? (
            <OffBoardingWidgets
              items={offBoarding}
              title="Off boarding"
              variant="panel"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
