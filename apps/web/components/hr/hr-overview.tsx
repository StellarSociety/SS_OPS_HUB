import { Building2, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HrBreakdownRow, HrOverviewStats } from "@/lib/hr/overview";

type HrOverviewProps = {
  stats: HrOverviewStats;
};

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
  const totalPercent = rows.reduce((sum, row) => sum + row.percent, 0);

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 shrink-0 text-[#3D421F]/70" aria-hidden />
        <h3 className="font-serif text-base text-[#3D421F]">{title}</h3>
      </div>
      <hr className="mt-2 border-t-2 border-black/15" />
      {rows.length > 0 ? (
        <div className="mt-3 space-y-2.5">
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
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-[#3D421F]">
                <span className="font-semibold">{row.count}</span>
                <span className="ml-1 text-black/45">{row.percent}%</span>
              </span>
            </div>
          ))}
          <div className="flex items-center gap-3 border-t border-black/10 pt-2.5">
            <span className="w-28 shrink-0 text-xs font-semibold text-[#3D421F]">
              Total
            </span>
            <div className="min-w-0 flex-1" />
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-[#3D421F]">
              <span className="font-semibold">{total}</span>
              <span className="ml-1 text-black/45">{totalPercent}%</span>
            </span>
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

export function HrOverview({ stats }: HrOverviewProps) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-2">
      <BreakdownCard
        icon={Building2}
        title="Headcount by Department"
        rows={stats.byDepartment}
        emptyLabel="No department data"
      />
      <BreakdownCard
        icon={Globe}
        title="Top Nationalities"
        rows={stats.byNationality}
        emptyLabel="No nationality data"
      />
    </div>
  );
}
