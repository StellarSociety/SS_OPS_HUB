import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPayrollExportPdfBase64 } from "@/lib/hr/payroll/payroll-export-pdf";
import { loadPayrollSettings } from "@/lib/hr/payroll/persist-run";
import type { CalculatedEmployeePayroll } from "@/lib/hr/payroll/types";
import {
  buildPayrollExport,
  buildPayrollExportFilename,
  dayFractionsFromSnapshot,
  type PayrollExportRow,
} from "@/lib/hr/payroll/wps";

export function payrollCompanyLegalName(venueName: string): string {
  const name = venueName.trim() || "Venue";
  if (/\bllc\b/i.test(name)) return name;
  if (/\brestaurant\b/i.test(name)) return `${name} LLC`;
  return `${name} Restaurant LLC`;
}

function mapRunEmployeeToCalcLike(e: {
  staff_id: string;
  emp_no: string | null;
  full_name: string | null;
  department_name: string | null;
  is_new_joiner: boolean | null;
  is_leaver: boolean | null;
  wps_employee_id: string | null;
  iban: string | null;
  bank_name: string | null;
  swift_code: string | null;
  wage_package: number | null;
  basic_salary: number | null;
  accom_allowance: number | null;
  transp_allowance: number | null;
  salary_to_pay: number | null;
  company_accommodation: boolean | null;
  daily_rate: number | null;
  calendar_days: number | null;
  paid_days: number | null;
  unpaid_days: number | null;
  half_pay_days: number | null;
  fixed_earnings: number | null;
  variable_earnings: number | null;
  total_deductions: number | null;
  gross_earnings: number | null;
  net_salary: number | null;
  snapshot: unknown;
}): CalculatedEmployeePayroll {
  const snapshot = e.snapshot as {
    effectivePaidDays?: number;
    dayFractions?: unknown;
  } | null;
  return {
    staffId: e.staff_id,
    empNo: e.emp_no ?? "",
    fullName: e.full_name ?? "",
    departmentId: null,
    departmentName: e.department_name,
    positionId: null,
    positionName: null,
    included: true,
    excludeReason: null,
    isNewJoiner: Boolean(e.is_new_joiner),
    isLeaver: Boolean(e.is_leaver),
    employmentStatus: null,
    wpsEmployeeId: e.wps_employee_id,
    iban: e.iban,
    bankName: e.bank_name,
    swiftCode: e.swift_code,
    wagePackage:
      e.wage_package != null && !Number.isNaN(Number(e.wage_package))
        ? Number(e.wage_package)
        : null,
    basicSalary:
      e.basic_salary != null && !Number.isNaN(Number(e.basic_salary))
        ? Number(e.basic_salary)
        : null,
    accomAllowance:
      e.accom_allowance != null && !Number.isNaN(Number(e.accom_allowance))
        ? Number(e.accom_allowance)
        : null,
    transpAllowance:
      e.transp_allowance != null && !Number.isNaN(Number(e.transp_allowance))
        ? Number(e.transp_allowance)
        : null,
    salaryToPay:
      e.salary_to_pay != null && !Number.isNaN(Number(e.salary_to_pay))
        ? Number(e.salary_to_pay)
        : null,
    companyAccommodation: Boolean(e.company_accommodation),
    dailyRate:
      e.daily_rate != null && !Number.isNaN(Number(e.daily_rate))
        ? Number(e.daily_rate)
        : null,
    calendarDays: Number(e.calendar_days) || 0,
    paidDays: Number(e.paid_days),
    effectivePaidDays: Number(snapshot?.effectivePaidDays ?? e.paid_days),
    unpaidDays: Number(e.unpaid_days),
    halfPayDays: Number(e.half_pay_days) || 0,
    fixedEarnings: Number(e.fixed_earnings),
    variableEarnings: Number(e.variable_earnings),
    totalDeductions: Number(e.total_deductions),
    grossEarnings: Number(e.gross_earnings),
    netSalary: Number(e.net_salary),
    lines: [],
    dayFractions: dayFractionsFromSnapshot(snapshot),
  };
}

export type PayrollExportPackage = {
  monthKey: string;
  payrollMonthLabel: string;
  companyName: string;
  runStatus: string;
  rows: PayrollExportRow[];
  errors: string[];
  xlsx: { filename: string; base64: string; mimeType: string };
  pdf: { filename: string; base64: string; mimeType: string };
};

export async function buildPayrollExportPackage(opts: {
  supabase: SupabaseClient;
  venueId: string;
  venueName: string;
  runId: string;
  userDisplayName?: string;
}): Promise<
  { ok: true; package: PayrollExportPackage } | { ok: false; error: string }
> {
  const { data: run } = await opts.supabase
    .from("hr_payroll_runs")
    .select("id, payment_date, payroll_month, status")
    .eq("id", opts.runId)
    .eq("venue_id", opts.venueId)
    .maybeSingle();

  if (!run) return { ok: false, error: "Run not found." };

  const [{ data: employees }, { data: adjustments }] = await Promise.all([
    opts.supabase
      .from("hr_payroll_run_employees")
      .select("*")
      .eq("run_id", opts.runId)
      .eq("included", true),
    opts.supabase
      .from("hr_payroll_adjustments")
      .select("staff_id, category, percent_of_daily_rate, days_applied, amount")
      .eq("run_id", opts.runId),
  ]);

  const monthKey = String(run.payroll_month).slice(0, 7);
  const [year, monthNum] = monthKey.split("-").map(Number);
  const payrollMonthLabel =
    Number.isFinite(year) && Number.isFinite(monthNum)
      ? new Date(year, monthNum - 1, 1).toLocaleString("en-GB", {
          month: "long",
          year: "numeric",
        })
      : monthKey;

  const companyName = payrollCompanyLegalName(opts.venueName);
  const payrollSettings = await loadPayrollSettings(opts.supabase, opts.venueId);

  const { buffer, rows, errors } = await buildPayrollExport({
    companyName,
    payrollMonthLabel,
    employees: (employees ?? []).map((e) =>
      mapRunEmployeeToCalcLike(
        e as Parameters<typeof mapRunEmployeeToCalcLike>[0],
      ),
    ),
    noBankPaymentMethod: payrollSettings.noBankPaymentMethod,
    adjustments: (adjustments ?? []).map((a) => ({
      staffId: a.staff_id as string,
      category: a.category as string,
      percentOfDailyRate:
        a.percent_of_daily_rate != null
          ? Number(a.percent_of_daily_rate)
          : null,
      daysApplied: a.days_applied != null ? Number(a.days_applied) : null,
      amount: a.amount != null ? Number(a.amount) : null,
    })),
  });

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        errors.length > 0
          ? `Payroll export is empty. ${errors.slice(0, 8).join(" ")}${
              errors.length > 8 ? ` (+${errors.length - 8} more)` : ""
            }`
          : "Payroll export is empty — no included employees on this run.",
    };
  }

  const pdf = buildPayrollExportPdfBase64({
    companyName,
    payrollMonthLabel,
    venueName: opts.venueName,
    monthKey,
    rows,
    userDisplayName: opts.userDisplayName,
  });

  return {
    ok: true,
    package: {
      monthKey,
      payrollMonthLabel,
      companyName,
      runStatus: String(run.status),
      rows,
      errors,
      xlsx: {
        filename: buildPayrollExportFilename(opts.venueName, monthKey),
        base64: buffer.toString("base64"),
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      pdf,
    },
  };
}
