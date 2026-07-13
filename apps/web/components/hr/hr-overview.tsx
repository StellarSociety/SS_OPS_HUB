import { ScopedLink as Link } from "@/components/layout/scoped-link";
import {
  AlertTriangle,
  Building2,
  Globe,
  UserCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HrBreakdownRow, HrOverviewStats } from "@/lib/hr/overview";

type HrOverviewProps = {
  stats: HrOverviewStats;
};

function HeadlineStat({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = "default",
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
  tone?: "default" | "warn" | "danger";
  href?: string;
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-[#3D421F]";

  const body = (
    <>
      <div className="flex items-center justify-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-black/40" aria-hidden />
        <p className="text-xs font-medium uppercase tracking-wide text-black/45">
          {label}
        </p>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {sublabel ? (
        <p className="mt-0.5 text-xs text-black/50">{sublabel}</p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Card className="flex h-full flex-col justify-center p-4 text-center transition-colors hover:border-[var(--venue-primary)]/30 hover:bg-white/80">
        <Link href={href} className="flex h-full flex-col justify-center">
          {body}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col justify-center p-4 text-center">
      {body}
    </Card>
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
              <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-[#3D421F]">
                {row.count}
              </span>
            </div>
          ))}
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
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <HeadlineStat
          icon={Users}
          label="Total headcount"
          value={stats.totalStaff.toLocaleString()}
          sublabel={`${stats.departmentCount} department${stats.departmentCount === 1 ? "" : "s"}`}
          href="/hr/staff"
        />
        <HeadlineStat
          icon={UserCheck}
          label="Active staff"
          value={stats.activeStaff.toLocaleString()}
          sublabel={
            stats.onLeaveOrTerminated > 0
              ? `${stats.onLeaveOrTerminated.toLocaleString()} inactive`
              : "All active"
          }
        />
        <HeadlineStat
          icon={Building2}
          label="Departments"
          value={stats.departmentCount.toLocaleString()}
        />
        <HeadlineStat
          icon={Globe}
          label="Nationalities"
          value={stats.nationalityCount.toLocaleString()}
        />
        <HeadlineStat
          icon={AlertTriangle}
          label="Expiring soon"
          value={stats.expiringSoon.toLocaleString()}
          sublabel={
            stats.overdue > 0
              ? `${stats.overdue.toLocaleString()} overdue`
              : "Next 90 days"
          }
          tone={
            stats.overdue > 0 ? "danger" : stats.expiringSoon > 0 ? "warn" : "default"
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownCard
          icon={Building2}
          title="Headcount by Department"
          rows={stats.byDepartment}
          emptyLabel="No department data"
        />
        <BreakdownCard
          icon={UserCheck}
          title="Employment Status"
          rows={stats.byStatus}
          emptyLabel="No status data"
        />
        <BreakdownCard
          icon={Globe}
          title="Top Nationalities"
          rows={stats.byNationality}
          emptyLabel="No nationality data"
        />
      </div>
    </div>
  );
}
