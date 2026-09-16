"use client";

import { useState } from "react";
import { Calculator, ChevronDown } from "lucide-react";
import {
  formatLeaveDays,
  formatServiceMonths,
  type AnnualLeaveCalculationBreakdown,
} from "@/lib/hr/leave";
import {
  computeEmploymentDuration,
  computeWorkTime,
  formatWorkedParts,
} from "@/lib/hr/derived";
import { cn } from "@/lib/utils";

function formatDayMonthYear(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value.trim();
}

function Row({
  label,
  value,
  aside,
  hint,
  emphasize,
  labelCaps,
  ruleAfter,
  tag,
  labelTag,
  compact,
}: {
  label: string;
  value: string;
  /** Extra amount on the same line, e.g. "Rounded: 19 days". */
  aside?: string;
  hint?: string;
  emphasize?: boolean;
  labelCaps?: boolean;
  /** Full-width rule, or a short rule aligned under the value only. */
  ruleAfter?: "full" | "value";
  tag?: "green" | "red" | "gray";
  labelTag?: string;
  compact?: boolean;
}) {
  return (
    <>
      <div
        className={
          emphasize
            ? "flex items-start justify-between gap-3 border-t border-black/10 pt-3 dark:border-white/12"
            : "flex items-start justify-between gap-3"
        }
      >
        <div className="min-w-0">
          <p
            className={cn(
              "flex flex-wrap items-center gap-2 text-[#3D421F] dark:text-[CanvasText]",
              compact ? "text-xs" : "text-sm",
              labelCaps && "font-semibold uppercase tracking-wide",
            )}
          >
            {label}
            {labelTag ? (
              <span className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
                {labelTag}
              </span>
            ) : null}
          </p>
          {hint ? (
            <p
              className={cn(
                "mt-0.5 text-black/45 dark:text-white/45",
                compact ? "text-[11px] leading-snug" : "text-xs",
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-baseline justify-end text-right",
            compact
              ? "max-w-[46%] flex-col items-end gap-0.5"
              : aside
                ? "min-w-[14rem] gap-4"
                : tag === "gray"
                  ? "w-auto gap-4"
                  : "w-[8.5rem] gap-4",
          )}
        >
          <span className="relative">
            <p
              className={cn(
                "tabular-nums",
                compact && "text-xs",
                tag === "green" &&
                  "inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
                tag === "red" &&
                  "inline-flex whitespace-nowrap rounded-full bg-red-50 px-2.5 py-0.5 font-medium text-red-800 dark:bg-red-500/20 dark:text-red-200",
                tag === "gray" &&
                  cn(
                    "inline-flex bg-neutral-100 px-2.5 py-0.5 font-medium text-neutral-600 dark:bg-white/10 dark:text-white/70",
                    compact
                      ? "rounded-md whitespace-normal text-right"
                      : "rounded-full whitespace-nowrap",
                  ),
                !tag &&
                  (emphasize || labelCaps
                    ? "font-medium text-[#3D421F] dark:text-[CanvasText]"
                    : "text-black/75 dark:text-white/70"),
              )}
            >
              {value}
            </p>
            {ruleAfter === "value" ? (
              <div
                className="absolute -bottom-1 -left-2 -right-2 border-t border-[#3D421F] dark:border-white/40"
                aria-hidden
              />
            ) : null}
          </span>
          {aside ? (
            <p
              className={cn(
                "tabular-nums font-medium text-[#3D421F] dark:text-[CanvasText]",
                compact && "text-[11px]",
              )}
            >
              {aside}
            </p>
          ) : null}
        </div>
      </div>
      {ruleAfter === "full" ? (
        <div className="border-t border-black/15 dark:border-white/12" aria-hidden />
      ) : null}
    </>
  );
}

function TenureSummary({
  calculation,
  compact,
}: {
  calculation: AnnualLeaveCalculationBreakdown;
  compact?: boolean;
}) {
  const tenureEnd = calculation.terminationDate ?? calculation.asOfDate;
  const ZERO_TENURE = formatWorkedParts({ years: 0, months: 0, days: 0 });
  const employmentDuration =
    computeEmploymentDuration(calculation.joiningDate, tenureEnd) ??
    ZERO_TENURE;
  const workTime =
    computeWorkTime(
      calculation.joiningDate,
      tenureEnd,
      calculation.unpaidLeaveDays + calculation.absenceDays,
    ) ?? ZERO_TENURE;

  return (
    <div className="grid grid-cols-2 divide-x divide-black/10 dark:divide-white/12">
      <div className={cn("text-center", compact ? "pr-3" : "pr-6")}>
        <p
          className={cn(
            "font-bold text-[#3D421F] dark:text-[CanvasText]",
            compact ? "text-xs" : "text-base",
          )}
        >
          Employment Duration
        </p>
        <p
          className={cn(
            "mt-1 font-medium tabular-nums text-[#3D421F] dark:text-[CanvasText]",
            compact ? "text-[11px]" : "text-sm",
          )}
          title="Calendar time from joining until termination (or as-of date)"
        >
          {employmentDuration}
        </p>
      </div>
      <div className={cn("text-center", compact ? "pl-3" : "pl-6")}>
        <p
          className={cn(
            "font-bold text-[#3D421F] dark:text-[CanvasText]",
            compact ? "text-xs" : "text-base",
          )}
        >
          Work Time
        </p>
        <p
          className={cn(
            "mt-1 font-medium tabular-nums text-[#3D421F] dark:text-[CanvasText]",
            compact ? "text-[11px]" : "text-sm",
          )}
          title="Employment duration minus unpaid leave (UPL) and unauthorised absence (ABS)"
        >
          {workTime}
        </p>
      </div>
    </div>
  );
}

function AnnualLeaveCalculationRows({
  calculation,
  compact = false,
}: {
  calculation: AnnualLeaveCalculationBreakdown;
  compact?: boolean;
}) {
  const asOfLabel = calculation.terminationDate
    ? "Termination Date"
    : "As-of Date";
  const asOfValue = calculation.terminationDate ?? calculation.asOfDate;
  const showCareerGross =
    Math.abs(
      calculation.careerGrossEntitlement -
        calculation.grossAnnualLeaveEntitlement,
    ) > 0.0001;

  return (
    <div className={cn(compact ? "space-y-2.5" : "space-y-3")}>
      <Row
          compact={compact}
          label="Joining Date"
          value={formatDayMonthYear(calculation.joiningDate)}
        />
        <Row
          compact={compact}
          label={asOfLabel}
          value={formatDayMonthYear(asOfValue)}
          ruleAfter="full"
        />
        <Row
          compact={compact}
          label="Calendar Service Days"
          value={`+${calculation.calendarServiceDays} Days`}
          hint="Termination / as-of date minus joining date"
          tag="green"
        />
        <Row
          compact={compact}
          label="Unpaid Leave Days"
          value={
            calculation.unpaidLeaveDays > 0
              ? `−${calculation.unpaidLeaveDays} Days`
              : "0 Days"
          }
          hint="Approved UPL subtracted from calendar service (not from the leave balance)"
          tag="red"
        />
        <Row
          compact={compact}
          label="Absence Days"
          value={
            calculation.absenceDays > 0
              ? `−${calculation.absenceDays} Days`
              : "0 Days"
          }
          hint="Unauthorised absence (ABS) subtracted from calendar service (not from the leave balance)"
          ruleAfter="value"
          tag="red"
        />
        <Row
          compact={compact}
          label="Qualifying Service Days"
          value={`=${calculation.qualifyingServiceDays} Days`}
          labelCaps
        />
        <Row
          compact={compact}
          label="Qualifying Service Months"
          value={formatServiceMonths(calculation.qualifyingServiceMonths)}
          hint="Qualifying days ÷ 30 (not rounded before the entitlement rate)"
        />
        <Row
          compact={compact}
          label="Applicable Entitlement Rate"
          value={calculation.rateLabel}
          tag="gray"
        />
        {showCareerGross ? (
          <Row
            compact={compact}
            label="Statutory entitlement (all service)"
            value={`${formatLeaveDays(calculation.careerGrossEntitlement)} days`}
            hint={
              calculation.completedYears > 0
                ? `${calculation.completedYears} completed year(s) at 30 days + pro-rata incomplete year`
                : undefined
            }
          />
        ) : null}
        <Row
          compact={compact}
          label="Gross Annual Leave Entitlement"
          value={`${formatLeaveDays(calculation.grossAnnualLeaveEntitlement)} days`}
          aside={`Rounded: ${calculation.roundedGrossAnnualLeaveEntitlement} days`}
          hint={
            showCareerGross
              ? "Accrued in this leave year from qualifying service"
              : undefined
          }
        />
        <Row
          compact={compact}
          label="Annual Leave Already Taken"
          labelTag="Up to Date"
          value={`${formatLeaveDays(calculation.annualLeaveAlreadyTaken)} days`}
        />
        <Row
          compact={compact}
          label="Previous Carry-Forward Balance"
          value={`${formatLeaveDays(calculation.previousCarryForwardBalance)} days`}
        />
        <Row
          compact={compact}
          label="Final Annual Leave Balance"
          value={`${calculation.roundedFinalAnnualLeaveBalance} days`}
          hint={`Exact remainder ${formatLeaveDays(calculation.finalAnnualLeaveBalance)} days, rounded to the nearest day for balances`}
          emphasize
        />
        <blockquote
          className={cn(
            "relative rounded-lg bg-black/[0.04] dark:bg-white/[0.06]",
            compact ? "mt-1 px-7 py-3" : "mt-1 px-10 py-4",
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute left-2 top-0 font-serif leading-none text-black/25 dark:text-white/25",
              compact ? "text-4xl" : "text-5xl",
            )}
            aria-hidden
          >
            ❝
          </span>
          <p
            className={cn(
              "text-center leading-relaxed text-black/55 dark:text-white/55",
              compact ? "text-[11px]" : "text-sm",
            )}
          >
            Qualifying service excludes approved unpaid leave and absence days
            first. Entitlement is then calculated from that service — those days
            are never deducted from the leave balance. UAE Federal Decree-Law
            No. 33 of 2021, Articles 29 and 33.
          </p>
          <span
            className={cn(
              "pointer-events-none absolute bottom-0 right-2 font-serif leading-none text-black/25 dark:text-white/25",
              compact ? "text-4xl" : "text-5xl",
            )}
            aria-hidden
          >
            ❞
          </span>
        </blockquote>
    </div>
  );
}

export function AnnualLeaveCalculationDetails({
  calculation,
  compact = false,
}: {
  calculation: AnnualLeaveCalculationBreakdown;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? "space-y-3" : "space-y-4")}>
      <TenureSummary calculation={calculation} compact={compact} />
      <AnnualLeaveCalculationRows
        calculation={calculation}
        compact={compact}
      />
    </div>
  );
}

export function AnnualLeaveCalculationCard({
  calculation,
}: {
  calculation: AnnualLeaveCalculationBreakdown;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-t-md border-b border-black/10 pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40"
      >
        <h3 className="flex items-center gap-2 font-serif text-lg text-[#3D421F]">
          <Calculator
            className="h-5 w-5 shrink-0 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
          Annual leave calculation
        </h3>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-black/45 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <div className="mt-4">
        <TenureSummary calculation={calculation} />
      </div>
      {open ? (
        <div className="mt-4">
          <AnnualLeaveCalculationRows calculation={calculation} />
        </div>
      ) : null}
    </section>
  );
}
