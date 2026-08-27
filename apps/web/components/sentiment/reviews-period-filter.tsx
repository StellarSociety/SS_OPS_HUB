"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
} from "lucide-react";
import {
  AttendanceDayRangePicker,
  AttendanceMultiMonthPicker,
  AttendanceMultiWeekPicker,
} from "@/components/hr/attendance-date-filters";
import { AnimatedSymbol } from "@/components/ui/animated-symbol";
import {
  lastDaysRangeInDubai,
  resolveReviewPeriod,
  reviewPeriodQuery,
  type ReviewPeriod,
} from "@/lib/sentiment/review-period";
import { pillSubNavShellClass, subNavLabelClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

const PERIOD_TABS: Array<{
  id: ReviewPeriod;
  label: string;
  icon: typeof Calendar;
}> = [
  { id: "days", label: "Days", icon: CalendarRange },
  { id: "week", label: "Week", icon: Calendar },
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "all", label: "All", icon: LayoutGrid },
];

export function ReviewsPeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolved = useMemo(
    () =>
      resolveReviewPeriod({
        period: searchParams.get("period") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
        week: searchParams.get("week") ?? undefined,
        month: searchParams.get("month") ?? undefined,
      }),
    [searchParams],
  );

  function navigate(next: Parameters<typeof reviewPeriodQuery>[0]) {
    const query = reviewPeriodQuery(next);
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function selectPeriod(period: ReviewPeriod) {
    if (period === "all") {
      navigate({ period: "all" });
      return;
    }
    if (period === "days") {
      const range = lastDaysRangeInDubai();
      navigate({
        period: "days",
        fromDate: resolved.period === "days" ? resolved.fromDate : range.fromDate,
        toDate: resolved.period === "days" ? resolved.toDate : range.toDate,
      });
      return;
    }
    if (period === "week") {
      navigate({
        period: "week",
        weekKey: resolved.period === "week" ? resolved.weekKey : undefined,
      });
      return;
    }
    navigate({
      period: "month",
      monthKey: resolved.period === "month" ? resolved.monthKey : undefined,
    });
  }

  return (
    <div className={cn(pillSubNavShellClass, "items-center")}>
      <LayoutGroup>
        <nav aria-label="Review period" className="flex flex-wrap gap-1">
          {PERIOD_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = resolved.period === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectPeriod(tab.id)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors",
                  subNavLabelClass,
                  active
                    ? "text-[#3D421F]"
                    : "text-black/55 hover:text-[#3D421F]",
                )}
                aria-pressed={active}
              >
                {active ? (
                  <motion.span
                    layoutId="reviews-period-tab"
                    className="absolute inset-0 rounded-lg bg-[var(--venue-primary)]/15"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <AnimatedSymbol>
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  </AnimatedSymbol>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </LayoutGroup>

      <AnimatePresence mode="wait" initial={false}>
        {resolved.period === "days" && resolved.fromDate && resolved.toDate ? (
          <motion.div
            key="days"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <AttendanceDayRangePicker
              fieldLabel=""
              startDate={resolved.fromDate}
              endDate={resolved.toDate}
              onChange={({ startDate, endDate }) => {
                if (!startDate || !endDate) return;
                navigate({
                  period: "days",
                  fromDate: startDate,
                  toDate: endDate,
                });
              }}
            />
          </motion.div>
        ) : null}

        {resolved.period === "week" && resolved.weekKey ? (
          <motion.div
            key="week"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <AttendanceMultiWeekPicker
              fieldLabel=""
              single
              selectedWeekKeys={[resolved.weekKey]}
              onChange={(keys) => {
                const next = keys[0];
                if (!next) return;
                navigate({ period: "week", weekKey: next });
              }}
            />
          </motion.div>
        ) : null}

        {resolved.period === "month" && resolved.monthKey ? (
          <motion.div
            key="month"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <AttendanceMultiMonthPicker
              fieldLabel=""
              single
              selectedMonthKeys={[resolved.monthKey]}
              onChange={(keys) => {
                const next = keys[0];
                if (!next) return;
                navigate({ period: "month", monthKey: next });
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
