import { Card } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/dates/display";
import type { SaveLogRecord, SaveLogType } from "@/lib/save-log/types";
import { cn } from "@/lib/utils";

type SaveLogDashboardMetricsProps = {
  today: string;
  types: SaveLogType[];
  weekRecords: SaveLogRecord[];
  monthRecords: SaveLogRecord[];
};

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function SaveLogDashboardMetrics({
  today,
  types,
  weekRecords,
  monthRecords,
}: SaveLogDashboardMetricsProps) {
  const required = types.filter((type) => type.required_daily);
  const todayTypeIds = new Set(
    weekRecords.filter((record) => record.log_date === today).map((record) => record.type_id),
  );
  const loggedToday = required.filter((type) => todayTypeIds.has(type.id)).length;
  const missing = required.filter((type) => !todayTypeIds.has(type.id));
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftIso(today, index - 6));
  const completeDays = weekDays.filter((date) => {
    const ids = new Set(
      weekRecords.filter((record) => record.log_date === date).map((record) => record.type_id),
    );
    return required.length > 0 && required.every((type) => ids.has(type.id));
  }).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Today"
          value={`${loggedToday} / ${required.length || 0}`}
          hint={
            required.length === 0
              ? "Add required log types in Settings"
              : missing.length === 0
                ? "All required HACCP logs are in"
                : `${missing.length} required log${missing.length === 1 ? "" : "s"} still missing`
          }
          tone={
            required.length === 0
              ? "neutral"
              : missing.length === 0
                ? "ok"
                : "warn"
          }
        />
        <MetricCard
          label="Last 7 days"
          value={String(completeDays)}
          hint="Days with every required log uploaded"
        />
        <MetricCard
          label="This month"
          value={String(monthRecords.length)}
          hint="Files uploaded in the current month"
        />
      </div>

      {missing.length > 0 ? (
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Missing for {formatDisplayDate(today)}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {missing.map((type) => (
              <li
                key={type.id}
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-800"
              >
                {type.label}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  return (
    <Card
      className={cn(
        "flex h-full flex-col items-center justify-center p-5 text-center",
        "transition-[transform,box-shadow,border-color,background-color] duration-500 ease-out",
        "hover:-translate-y-px hover:border-black/10 hover:bg-white/80",
        "hover:shadow-[0_10px_28px_rgba(61,66,31,0.08)]",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-serif text-3xl font-semibold text-[#3D421F]",
          tone === "ok" && "text-[var(--venue-primary,#818a40)]",
          tone === "warn" && "text-[#b23b2e]",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-black/50">{hint}</p>
    </Card>
  );
}
