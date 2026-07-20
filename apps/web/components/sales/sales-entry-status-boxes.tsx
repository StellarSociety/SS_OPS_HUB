import { ScopedLink as Link } from "@/components/layout/scoped-link";
import type { LucideIcon } from "lucide-react";
import { Camera, Coins, GitCompareArrows, Percent, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCount, formatMoney } from "@/lib/sales/daily-sales-calculations";
import type { SalesEntryStatusDay } from "@/lib/sales/sales-entry-status";

type SalesEntryStatusBoxesProps = {
  days: SalesEntryStatusDay[];
};

function signedValue(
  value: number,
  formatter: (value: number) => string,
): string {
  if (value === 0) return formatter(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatter(Math.abs(value))}`;
}

function differenceClass(value: number): string {
  return value === 0 ? "text-emerald-700" : "font-semibold text-amber-700";
}

function DateLabel({ ddmm }: { ddmm: string }) {
  return (
    <span className="w-9 shrink-0 text-[11px] font-bold tabular-nums text-black">
      {ddmm}
    </span>
  );
}

const ROW_CLASS =
  "flex flex-1 items-center gap-2 border-b border-black/5 py-1 last:border-0";

function NoEntry() {
  return <span className="font-semibold text-red-600">No entry</span>;
}

function TwoColRow({
  ddmm,
  empty,
  left,
  right,
}: {
  ddmm: string;
  empty: boolean;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className={ROW_CLASS}>
      <DateLabel ddmm={ddmm} />
      {empty ? (
        <div className="min-w-0 flex-1 text-right text-[11px]">
          <NoEntry />
        </div>
      ) : (
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 text-[11px] tabular-nums">
          <span className="text-right">{left}</span>
          <span className="text-right">{right}</span>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon: Icon,
  title,
  href,
  subtitle,
  columns,
  children,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  subtitle?: string;
  columns?: [string, string];
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <Link
        href={href}
        className="group flex items-center gap-1.5 font-serif text-base text-[#3D421F] transition-colors hover:text-[var(--venue-primary)]"
      >
        <Icon className="h-4 w-4 shrink-0 text-[#3D421F]/70" aria-hidden />
        <span className="group-hover:underline">{title}</span>
      </Link>
      <hr className="mt-2 border-t-2 border-black/15" />
      {columns ? (
        <div className="mt-0.5 flex items-baseline gap-2 text-xs text-black/50">
          <span className="w-9 shrink-0" aria-hidden />
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <span className="text-right">{columns[0]}</span>
            <span className="text-right">{columns[1]}</span>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 text-right text-xs text-black/50">{subtitle}</p>
      )}
      <div className="mt-2 flex flex-1 flex-col">{children}</div>
    </Card>
  );
}

export function SalesEntryStatusBoxes({ days }: SalesEntryStatusBoxesProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatusCard
        icon={Coins}
        title="Daily Sales Entry"
        href="/sales/daily"
        columns={["Lunch", "Dinner"]}
      >
        {days.map((day) => (
          <TwoColRow
            key={day.isoDate}
            ddmm={day.ddmm}
            empty={!day.dailySales.hasEntry}
            left={
              <span className="text-black/75">
                {formatMoney(day.dailySales.lunchGs)}
              </span>
            }
            right={
              <span className="text-black/75">
                {formatMoney(day.dailySales.dinnerGs)}
              </span>
            }
          />
        ))}
      </StatusCard>

      <StatusCard
        icon={UserRound}
        title="Waiter Sales Entry"
        href="/sales/waiter"
        subtitle="Waiter [sales]"
      >
        {days.map((day) => (
          <div key={day.isoDate} className={ROW_CLASS}>
            <DateLabel ddmm={day.ddmm} />
            <div className="min-w-0 flex-1 text-left text-[11px] leading-snug">
              {day.waiterSales.hasEntry ? (
                <span className="text-black/75">
                  {day.waiterSales.waiters.map((waiter, index) => (
                    <span key={`${waiter.name}-${index}`}>
                      {waiter.name}{" "}
                      <span className="tabular-nums text-[#3D421F]">
                        [{formatMoney(waiter.salesGs)}]
                      </span>
                      {index < day.waiterSales.waiters.length - 1 ? (
                        <span className="mx-1 text-black/30">|</span>
                      ) : null}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="block text-right">
                  <NoEntry />
                </span>
              )}
            </div>
          </div>
        ))}
      </StatusCard>

      <StatusCard
        icon={GitCompareArrows}
        title="Daily & Waiters"
        href="/sales/daily-vs-waiters/figures-verification"
        columns={["Δ Covers", "Δ Revenue"]}
      >
        {days.map((day) => (
          <TwoColRow
            key={day.isoDate}
            ddmm={day.ddmm}
            empty={!day.dailyVsWaiters.hasData}
            left={
              <span className={differenceClass(day.dailyVsWaiters.coversDiff)}>
                {signedValue(day.dailyVsWaiters.coversDiff, formatCount)}
              </span>
            }
            right={
              <span className={differenceClass(day.dailyVsWaiters.revenueDiff)}>
                {signedValue(day.dailyVsWaiters.revenueDiff, formatMoney)}
              </span>
            }
          />
        ))}
      </StatusCard>

      <StatusCard
        icon={Percent}
        title="Discounts Entries"
        href="/sales/discounts"
        columns={["Total", "Discrepancy"]}
      >
        {days.map((day) => (
          <TwoColRow
            key={day.isoDate}
            ddmm={day.ddmm}
            empty={!day.discounts.hasEntry}
            left={
              <span className="text-black/75">
                {formatMoney(day.discounts.totalGs)}
              </span>
            }
            right={
              day.discounts.discrepancyGs !== 0 ? (
                <span className="font-semibold text-amber-700">
                  Δ {signedValue(day.discounts.discrepancyGs, formatMoney)}
                </span>
              ) : (
                <span className="text-black/30">—</span>
              )
            }
          />
        ))}
      </StatusCard>

      <StatusCard
        icon={Camera}
        title="Daily Snap"
        href="/sales/daily-snap"
        subtitle="Closing report"
      >
        {days.map((day) => (
          <div key={day.isoDate} className={ROW_CLASS}>
            <DateLabel ddmm={day.ddmm} />
            <div className="min-w-0 flex-1 text-left text-[11px] leading-snug">
              {day.dailySnap.hasReport ? (
                <span>
                  <span className="font-medium text-emerald-700">
                    Closing Report
                  </span>
                  {day.dailySnap.editorName ? (
                    <span className="text-black/45">
                      {" "}
                      · {day.dailySnap.editorName}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="block text-right font-semibold text-red-600">
                  Closing Report Not Created
                </span>
              )}
            </div>
          </div>
        ))}
      </StatusCard>
    </div>
  );
}
