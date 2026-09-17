"use client";

import { useState, type ReactNode } from "react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import type { LucideIcon } from "lucide-react";
import {
  Camera,
  ChevronDown,
  Coins,
  GitCompareArrows,
  Percent,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCount, formatMoney } from "@/lib/sales/daily-sales-calculations";
import type { SalesEntryStatusDay } from "@/lib/sales/sales-entry-status";
import { cn } from "@/lib/utils";

type SalesEntryStatusBoxesProps = {
  days: SalesEntryStatusDay[];
  /** When false, card titles are labels and do not open webapp pages. */
  navigate?: boolean;
  /** Single column — phone canvas ignores the desktop viewport. */
  compact?: boolean;
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
  left: ReactNode;
  right: ReactNode;
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
  navigate = true,
  collapsible = false,
  summary,
  children,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  subtitle?: string;
  columns?: [string, string];
  navigate?: boolean;
  collapsible?: boolean;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  const showBody = !collapsible || open;

  const heading = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-[#3D421F]/70" aria-hidden />
      <span
        className={cn(
          "min-w-0 truncate",
          navigate && !collapsible ? "group-hover:underline" : undefined,
        )}
      >
        {title}
      </span>
    </>
  );

  return (
    <Card className={cn("flex flex-col p-4", !collapsible && "h-full")}>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 text-left font-serif text-base text-[#3D421F]"
        >
          {heading}
          {!open && summary ? (
            <span className="ml-auto min-w-0 max-w-[45%] truncate text-right font-sans text-[11px] font-medium text-black/50">
              {summary}
            </span>
          ) : (
            <span className="ml-auto" />
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-black/35 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      ) : navigate ? (
        <Link
          href={href}
          className="group flex items-center gap-1.5 font-serif text-base text-[#3D421F] transition-colors hover:text-[var(--venue-primary)]"
        >
          {heading}
        </Link>
      ) : (
        <div className="flex items-center gap-1.5 font-serif text-base text-[#3D421F]">
          {heading}
        </div>
      )}
      {showBody ? (
        <>
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
        </>
      ) : null}
    </Card>
  );
}

export function SalesEntryStatusBoxes({
  days,
  navigate = true,
  compact = false,
}: SalesEntryStatusBoxesProps) {
  const today = days[0];

  return (
    <div
      className={
        compact
          ? "grid grid-cols-1 gap-2"
          : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      }
    >
      <StatusCard
        icon={Coins}
        title="Daily Sales Entry"
        href="/sales/daily"
        columns={["Lunch", "Dinner"]}
        navigate={navigate}
        collapsible={compact}
        summary={
          today && !today.dailySales.hasEntry ? (
            <span className="font-semibold text-red-600">No entry</span>
          ) : today ? (
            `${formatMoney(today.dailySales.lunchGs)} / ${formatMoney(today.dailySales.dinnerGs)}`
          ) : null
        }
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
        navigate={navigate}
        collapsible={compact}
        summary={
          today && !today.waiterSales.hasEntry ? (
            <span className="font-semibold text-red-600">No entry</span>
          ) : today ? (
            `${today.waiterSales.waiters.length} waiter${today.waiterSales.waiters.length === 1 ? "" : "s"}`
          ) : null
        }
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
        navigate={navigate}
        collapsible={compact}
        summary={
          today && !today.dailyVsWaiters.hasData ? (
            <span className="font-semibold text-red-600">No entry</span>
          ) : today ? (
            `${signedValue(today.dailyVsWaiters.coversDiff, formatCount)} / ${signedValue(today.dailyVsWaiters.revenueDiff, formatMoney)}`
          ) : null
        }
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
        navigate={navigate}
        collapsible={compact}
        summary={
          today && !today.discounts.hasEntry ? (
            <span className="font-semibold text-red-600">No entry</span>
          ) : today ? (
            formatMoney(today.discounts.totalGs)
          ) : null
        }
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
        navigate={navigate}
        collapsible={compact}
        summary={
          today?.dailySnap.hasReport ? (
            <span className="font-medium text-emerald-700">Report</span>
          ) : (
            <span className="font-semibold text-red-600">Not created</span>
          )
        }
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
