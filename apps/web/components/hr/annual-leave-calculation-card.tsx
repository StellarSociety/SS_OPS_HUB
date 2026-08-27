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
}) {
  return (
    <>
      <div
        className={
          emphasize
            ? "flex items-start justify-between gap-4 border-t border-black/10 pt-3"
            : "flex items-start justify-between gap-4"
        }
      >
        <div className="min-w-0">
          <p
            className={cn(
              "flex flex-wrap items-center gap-2 text-sm text-[#3D421F]",
              labelCaps && "font-semibold uppercase tracking-wide",
            )}
          >
            {label}
            {labelTag ? (
              <span className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                {labelTag}
              </span>
            ) : null}
          </p>
          {hint ? <p className="mt-0.5 text-xs text-black/45">{hint}</p> : null}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-baseline justify-end gap-4 text-right",
            aside ? "min-w-[14rem]" : tag === "gray" ? "w-auto" : "w-[8.5rem]",
          )}
        >
          <span className="relative">
            <p
              className={cn(
                "tabular-nums",
                tag === "green" &&
                  "inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-800",
                tag === "red" &&
                  "inline-flex whitespace-nowrap rounded-full bg-red-50 px-2.5 py-0.5 font-medium text-red-800",
                tag === "gray" &&
                  "inline-flex whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-0.5 font-medium text-neutral-600",
                !tag &&
                  (emphasize || labelCaps
                    ? "font-medium text-[#3D421F]"
                    : "text-black/75"),
              )}
            >
              {value}
            </p>
            {ruleAfter === "value" ? (
              <div
                className="absolute -bottom-1 -left-2 -right-2 border-t border-[#3D421F]"
                aria-hidden
              />
            ) : null}
          </span>
          {aside ? (
            <p className="tabular-nums font-medium text-[#3D421F]">{aside}</p>
          ) : null}
        </div>
      </div>
      {ruleAfter === "full" ? (
        <div className="border-t border-black/15" aria-hidden />
      ) : null}
    </>
  );
}

export function AnnualLeaveCalculationCard({
  calculation,
}: {
  calculation: AnnualLeaveCalculationBreakdown;
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
  const [open, setOpen] = useState(false);
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
      <div className="mt-4 grid grid-cols-2 divide-x divide-black/10">
        <div className="pr-6 text-center">
          <p className="text-base font-bold text-[#3D421F]">Employment Duration</p>
          <p
            className="mt-1 text-sm font-medium tabular-nums text-[#3D421F]"
            title="Calendar time from joining until termination (or as-of date)"
          >
            {employmentDuration}
          </p>
        </div>
        <div className="pl-6 text-center">
          <p className="text-base font-bold text-[#3D421F]">Work Time</p>
          <p
            className="mt-1 text-sm font-medium tabular-nums text-[#3D421F]"
            title="Employment duration minus unpaid leave (UPL) and unauthorised absence (ABS)"
          >
            {workTime}
          </p>
        </div>
      </div>
      {open ? (
      <div className="mt-4 space-y-3">
        <Row
          label="Joining Date"
          value={formatDayMonthYear(calculation.joiningDate)}
        />
        <Row
          label={asOfLabel}
          value={formatDayMonthYear(asOfValue)}
          ruleAfter="full"
        />
        <Row
          label="Calendar Service Days"
          value={`+${calculation.calendarServiceDays} Days`}
          hint="Termination / as-of date minus joining date"
          tag="green"
        />
        <Row
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
          label="Qualifying Service Days"
          value={`=${calculation.qualifyingServiceDays} Days`}
          labelCaps
        />
        <Row
          label="Qualifying Service Months"
          value={formatServiceMonths(calculation.qualifyingServiceMonths)}
          hint="Qualifying days ÷ 30 (not rounded before the entitlement rate)"
        />
        <Row
          label="Applicable Entitlement Rate"
          value={calculation.rateLabel}
          tag="gray"
        />
        {showCareerGross ? (
          <Row
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
          label="Annual Leave Already Taken"
          labelTag="Up to Date"
          value={`${formatLeaveDays(calculation.annualLeaveAlreadyTaken)} days`}
        />
        <Row
          label="Previous Carry-Forward Balance"
          value={`${formatLeaveDays(calculation.previousCarryForwardBalance)} days`}
        />
        <Row
          label="Final Annual Leave Balance"
          value={`${calculation.roundedFinalAnnualLeaveBalance} days`}
          hint={`Exact remainder ${formatLeaveDays(calculation.finalAnnualLeaveBalance)} days, rounded to the nearest day for balances`}
          emphasize
        />
        <blockquote className="relative mt-1 rounded-lg bg-black/[0.04] px-10 py-4">
          <span
            className="pointer-events-none absolute left-2 top-0 font-serif text-5xl leading-none text-black/25"
            aria-hidden
          >
            ❝
          </span>
          <p className="text-center text-sm leading-relaxed text-black/55">
            Qualifying service excludes approved unpaid leave and absence days
            first. Entitlement is then calculated from that service — those days
            are never deducted from the leave balance. UAE Federal Decree-Law
            No. 33 of 2021, Articles 29 and 33.
          </p>
          <span
            className="pointer-events-none absolute bottom-0 right-2 font-serif text-5xl leading-none text-black/25"
            aria-hidden
          >
            ❞
          </span>
        </blockquote>
      </div>
      ) : null}
    </section>
  );
}
