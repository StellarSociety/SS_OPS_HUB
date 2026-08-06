"use client";

import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scheduleLeaveDisplayName } from "@/lib/hr/leave";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll/period";
import type { PayrollDayFraction } from "@/lib/hr/payroll/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type DayVisual =
  | "worked"
  | "paid_leave"
  | "half_pay_leave"
  | "unpaid_leave"
  | "off"
  | "unpaid"
  | "out_of_period"
  | "empty";

const DAY_STYLES: Record<
  DayVisual,
  { cell: string; label: string; legend: string }
> = {
  worked: {
    cell: "bg-[var(--venue-primary,#818a40)] text-white border-[var(--venue-primary,#818a40)]",
    label: "Worked",
    legend: "bg-[var(--venue-primary,#818a40)]",
  },
  paid_leave: {
    cell: "bg-sky-600 text-white border-sky-600",
    label: "Paid leave",
    legend: "bg-sky-600",
  },
  half_pay_leave: {
    cell: "bg-amber-500 text-white border-amber-500",
    label: "Half-pay leave",
    legend: "bg-amber-500",
  },
  unpaid_leave: {
    cell: "bg-rose-500 text-white border-rose-500",
    label: "Unpaid leave",
    legend: "bg-rose-500",
  },
  off: {
    cell: "bg-zinc-200 text-zinc-600 border-zinc-300",
    label: "Off / rest",
    legend: "bg-zinc-300",
  },
  unpaid: {
    cell: "bg-rose-100 text-rose-800 border-rose-200",
    label: "Unpaid / not cleared",
    legend: "bg-rose-200",
  },
  out_of_period: {
    cell: "bg-black/[0.03] text-black/25 border-transparent",
    label: "Outside period",
    legend: "bg-black/10",
  },
  empty: {
    cell: "bg-white text-black/35 border-black/8",
    label: "No data",
    legend: "bg-white border border-black/15",
  },
};

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "").trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toIsoKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Continuous Mon–Sun grid covering the payroll period in one arrangement. */
function buildPeriodGrid(
  periodStart: string,
  periodEnd: string,
): Array<{
  key: string;
  day: number;
  monthIndex: number;
  year: number;
  inPeriod: boolean;
  showMonthLabel: boolean;
}> {
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  if (!start || !end) return [];

  const startDate = new Date(start.y, start.m - 1, start.d);
  const endDate = new Date(end.y, end.m - 1, end.d);
  // Monday-start week containing period start
  const startOffset = (startDate.getDay() + 6) % 7;
  const gridStart = addDays(startDate, -startOffset);
  // Sunday-end week containing period end
  const endOffset = 6 - ((endDate.getDay() + 6) % 7);
  const gridEnd = addDays(endDate, endOffset);

  const startKey = toIsoKey(startDate);
  const endKey = toIsoKey(endDate);
  const cells: Array<{
    key: string;
    day: number;
    monthIndex: number;
    year: number;
    inPeriod: boolean;
    showMonthLabel: boolean;
  }> = [];

  for (
    let cursor = new Date(gridStart);
    cursor <= gridEnd;
    cursor = addDays(cursor, 1)
  ) {
    const key = toIsoKey(cursor);
    const day = cursor.getDate();
    const monthIndex = cursor.getMonth();
    const year = cursor.getFullYear();
    const inPeriod = key >= startKey && key <= endKey;
    cells.push({
      key,
      day,
      monthIndex,
      year,
      inPeriod,
      showMonthLabel: inPeriod && (day === 1 || key === startKey),
    });
  }

  return cells;
}

function classifyDay(
  day: PayrollDayFraction | undefined,
  inPeriod: boolean,
): DayVisual {
  if (!inPeriod) return "out_of_period";
  if (!day) return "empty";

  if (day.isLeave) {
    if (!day.approved) return "unpaid";
    const status = day.paidStatus;
    if (status === "half_pay") return "half_pay_leave";
    if (status === "unpaid" || status === "unknown") return "unpaid_leave";
    if (day.unpaidFraction >= 0.99) return "unpaid_leave";
    if (day.payFraction > 0.4 && day.payFraction < 0.6) return "half_pay_leave";
    return "paid_leave";
  }

  if (!day.approved) return "unpaid";
  if (day.paidStatus === "off") return "off";
  if (day.paidStatus === "worked") return "worked";
  if (day.payFraction >= 0.99) return "worked";
  if (day.payFraction <= 0.01 && day.unpaidFraction >= 0.99) return "off";
  if (day.payFraction > 0) return "worked";
  return "off";
}

function dayTooltip(
  day: PayrollDayFraction | undefined,
  visual: DayVisual,
  key: string,
): string {
  if (visual === "out_of_period") return `${key} · Outside payroll period`;
  if (!day) return `${key} · No roster / attendance data`;
  const code = (day.labelCode || "—").trim();
  const name =
    day.isLeave && code && code !== "—"
      ? scheduleLeaveDisplayName(code)
      : code;
  const status = DAY_STYLES[visual].label;
  const cleared = day.approved ? "cleared" : "not cleared";
  return `${key} · ${name} · ${status} · ${cleared}`;
}

export function PayrollPaidDaysCalendarDialog({
  open,
  onClose,
  empNo,
  fullName,
  periodStart,
  periodEnd,
  dayFractions,
  paidDays,
  loading = false,
  payrollMonth = null,
  onNavigateMonth,
}: {
  open: boolean;
  onClose: () => void;
  empNo: string;
  fullName: string;
  periodStart: string;
  periodEnd: string;
  dayFractions: PayrollDayFraction[];
  paidDays: number;
  /** Show a loading state while day data is fetched. */
  loading?: boolean;
  /** Named payroll month (YYYY-MM-01) — enables month label in the nav. */
  payrollMonth?: string | null;
  /** When set, shows prev/next arrows above the calendar. */
  onNavigateMonth?: (direction: -1 | 1) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, PayrollDayFraction>();
    for (const day of dayFractions) {
      const key = String(day.workDate ?? "").slice(0, 10);
      if (key) map.set(key, day);
    }
    return map;
  }, [dayFractions]);

  const cells = useMemo(
    () =>
      periodStart && periodEnd ? buildPeriodGrid(periodStart, periodEnd) : [],
    [periodStart, periodEnd],
  );

  const counts = useMemo(() => {
    const tallies: Partial<Record<DayVisual, number>> = {};
    const startKey = periodStart.slice(0, 10);
    const endKey = periodEnd.slice(0, 10);
    for (const day of dayFractions) {
      const key = String(day.workDate ?? "").slice(0, 10);
      if (!startKey || !endKey || key < startKey || key > endKey) continue;
      const visual = classifyDay(day, true);
      tallies[visual] = (tallies[visual] ?? 0) + 1;
    }
    return tallies;
  }, [dayFractions, periodStart, periodEnd]);

  const monthLabel = useMemo(() => {
    if (!payrollMonth) return null;
    try {
      return formatPayrollMonthLabel(payrollMonth);
    } catch {
      return payrollMonth.slice(0, 7);
    }
  }, [payrollMonth]);

  if (!open || !mounted) return null;

  const periodLabel =
    periodStart && periodEnd
      ? `${periodStart.slice(0, 10)} → ${periodEnd.slice(0, 10)}`
      : "Current payroll period";

  const showMonthNav = Boolean(onNavigateMonth);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close paid days calendar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Paid days calendar for ${fullName}`}
        className="relative z-10 flex max-h-[min(92dvh,56rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-serif text-lg text-[#3D421F]">
              {fullName}
              <span className="ml-2 font-sans text-sm font-normal text-black/45">
                {empNo}
              </span>
            </h3>
            <p className="mt-0.5 text-sm text-black/55">
              Payroll period {periodLabel}
              {!loading ? (
                <>
                  <span className="mx-1.5 text-black/25">·</span>
                  Paid days{" "}
                  <span className="tabular-nums font-medium text-[#3D421F]">
                    {Number(paidDays).toFixed(2)}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {showMonthNav ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous payroll month"
                disabled={loading}
                onClick={() => onNavigateMonth?.(-1)}
                className="inline-flex size-9 items-center justify-center rounded-md border border-black/10 text-[#3D421F] transition hover:bg-black/[0.04] disabled:opacity-40"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <div className="min-w-0 text-center">
                <p className="font-serif text-base text-[#3D421F]">
                  {monthLabel ?? "Payroll month"}
                </p>
                <p className="text-[11px] tabular-nums text-black/40">
                  {periodLabel}
                </p>
              </div>
              <button
                type="button"
                aria-label="Next payroll month"
                disabled={loading}
                onClick={() => onNavigateMonth?.(1)}
                className="inline-flex size-9 items-center justify-center rounded-md border border-black/10 text-[#3D421F] transition hover:bg-black/[0.04] disabled:opacity-40"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}

          {loading ? (
            <p className="rounded-lg border border-dashed border-black/15 px-3 py-8 text-center text-sm text-black/45">
              Loading schedule…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-black/55">
                {(
                  [
                    "worked",
                    "paid_leave",
                    "half_pay_leave",
                    "unpaid_leave",
                    "off",
                    "unpaid",
                  ] as DayVisual[]
                ).map((key) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <span
                      className={cn("size-2.5 rounded-sm", DAY_STYLES[key].legend)}
                    />
                    {DAY_STYLES[key].label}
                    {counts[key] != null ? (
                      <span className="tabular-nums text-black/35">
                        ({counts[key]})
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-black/40">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((cell) => {
                    const day = byDate.get(cell.key);
                    const visual = classifyDay(day, cell.inPeriod);
                    const style = DAY_STYLES[visual];
                    return (
                      <div
                        key={cell.key}
                        title={dayTooltip(day, visual, cell.key)}
                        className={cn(
                          "flex min-h-12 flex-col items-center justify-center rounded-md border px-0.5 py-1 text-xs tabular-nums",
                          style.cell,
                          cell.inPeriod && "ring-1 ring-inset ring-black/5",
                        )}
                      >
                        {cell.showMonthLabel ? (
                          <span className="text-[8px] font-medium uppercase leading-none opacity-80">
                            {MONTH_SHORT[cell.monthIndex]}
                          </span>
                        ) : null}
                        <span className="leading-none">{cell.day}</span>
                        {cell.inPeriod && day?.isLeave && day.labelCode ? (
                          <span className="mt-0.5 max-w-full truncate text-[8px] leading-none opacity-90">
                            {day.labelCode}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {dayFractions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-black/15 px-3 py-4 text-center text-sm text-black/45">
                  No day-level roster data for this payroll period yet.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-black/8 px-4 py-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border border-black/10 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
