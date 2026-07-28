import {
  formatPayrollMonthLabel,
  mergePayrollSettings,
  parsePayrollMonth,
  payrollMonthKey,
  resolvePayrollPeriod,
  type HrPayrollSettings,
} from "@/lib/hr/payroll";
import type {
  BenefitPeriod,
  BenefitPeriodMode,
  HrGratuitySettings,
  HrServiceChargeSettings,
} from "./types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function clampDay(year: number, month1to12: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(year, month1to12));
}

function addMonths(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + offset;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

type PeriodSettings = {
  periodMode: BenefitPeriodMode;
  periodStartDay: number;
  periodEndDay: number;
  distributionDayOfMonth: number;
  distributionMonthOffset: number;
};

function resolveCalendarWindow(
  year: number,
  month: number,
  settings: PeriodSettings,
): { periodStart: string; periodEnd: string } {
  const startDay = clampDay(year, month, settings.periodStartDay);
  const endDay = clampDay(year, month, settings.periodEndDay);
  if (settings.periodStartDay <= settings.periodEndDay) {
    return {
      periodStart: isoDate(year, month, startDay),
      periodEnd: isoDate(year, month, endDay),
    };
  }
  const next = addMonths(year, month, 1);
  return {
    periodStart: isoDate(year, month, startDay),
    periodEnd: isoDate(
      next.year,
      next.month,
      clampDay(next.year, next.month, endDay),
    ),
  };
}

/**
 * Resolve tip / service-charge window for a named benefit month (YYYY-MM).
 * Distribution date follows SOP (default: 15th of the following month).
 */
export function resolveBenefitPeriod(
  benefitMonthInput: string,
  settings: PeriodSettings,
  payrollSettings?: HrPayrollSettings | null,
): BenefitPeriod {
  const { year, month } = parsePayrollMonth(benefitMonthInput);
  const benefitMonth = payrollMonthKey(year, month);

  let periodStart: string;
  let periodEnd: string;

  if (settings.periodMode === "payroll_period" && payrollSettings) {
    const payroll = resolvePayrollPeriod(
      benefitMonthInput,
      mergePayrollSettings(payrollSettings),
    );
    periodStart = payroll.periodStart;
    periodEnd = payroll.periodEnd;
  } else {
    const window = resolveCalendarWindow(year, month, settings);
    periodStart = window.periodStart;
    periodEnd = window.periodEnd;
  }

  const dist = addMonths(year, month, settings.distributionMonthOffset);
  const distributionDate = isoDate(
    dist.year,
    dist.month,
    clampDay(dist.year, dist.month, settings.distributionDayOfMonth),
  );

  return {
    benefitMonth,
    periodStart,
    periodEnd,
    distributionDate,
  };
}

export function resolveGratuityPeriod(
  benefitMonthInput: string,
  settings: HrGratuitySettings,
  payrollSettings?: HrPayrollSettings | null,
): BenefitPeriod {
  return resolveBenefitPeriod(benefitMonthInput, settings, payrollSettings);
}

export function resolveServiceChargePeriod(
  benefitMonthInput: string,
  settings: HrServiceChargeSettings,
  payrollSettings?: HrPayrollSettings | null,
): BenefitPeriod {
  return resolveBenefitPeriod(benefitMonthInput, settings, payrollSettings);
}

export function formatBenefitMonthLabel(benefitMonth: string): string {
  return formatPayrollMonthLabel(benefitMonth);
}

export {
  parsePayrollMonth,
  payrollMonthKey,
  payrollMonthInputValue,
} from "@/lib/hr/payroll";
