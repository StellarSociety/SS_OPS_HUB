import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPayrollExportPdfBase64 } from "@/lib/hr/payroll/payroll-export-pdf";
import { loadPayrollSettings } from "@/lib/hr/payroll/persist-run";
import type { CalculatedEmployeePayroll } from "@/lib/hr/payroll/types";
import { createServiceClient } from "@/lib/supabase/service";
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

type SavedPayrollLine = {
  id: string;
  run_employee_id: string;
  category: string;
  code: string;
  label: string | null;
  amount: number | string | null;
};

/** Typed reason / days / % of the manual adjustment behind a payroll line. */
type LineAdjustmentDetail = {
  reason: string;
  daysApplied: number | null;
  percentOfDailyRate: number | null;
  enteredBy: string | null;
  /** ISO date the adjustment was entered. */
  enteredOn: string | null;
};

function mapRunEmployeeToCalcLike(
  e: {
  id: string;
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
},
  savedLines: SavedPayrollLine[] = [],
  adjustmentByLineId: Map<string, LineAdjustmentDetail> = new Map(),
): CalculatedEmployeePayroll {
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
    // Saved run lines — the export splits variable pay by code (TIPS, …).
    lines: savedLines
      .filter((line) => line.run_employee_id === e.id)
      .map((line, index) => ({
        category: line.category as CalculatedEmployeePayroll["lines"][number]["category"],
        code: String(line.code ?? ""),
        label: String(line.label ?? ""),
        amount: Number(line.amount) || 0,
        source: "system" as const,
        sortOrder: index,
        meta: adjustmentByLineId.has(line.id)
          ? { adjustment: adjustmentByLineId.get(line.id) }
          : undefined,
      })),
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

  const [{ data: employees }, { data: adjustments }, { data: savedLines }] = await Promise.all([
    opts.supabase
      .from("hr_payroll_run_employees")
      .select("*")
      .eq("run_id", opts.runId)
      .eq("included", true),
    opts.supabase
      .from("hr_payroll_adjustments")
      .select(
        "staff_id, run_employee_id, category, code, percent_of_daily_rate, days_applied, amount, reason, applied_line_id, created_by, created_at",
      )
      .eq("run_id", opts.runId),
    opts.supabase
      .from("hr_payroll_lines")
      .select("id, run_employee_id, category, code, label, amount")
      .eq("run_id", opts.runId)
      .in("category", ["variable", "deduction"])
      .order("sort_order", { ascending: true }),
  ]);

  // Who entered each manual adjustment (for the explanation lines).
  const creatorIds = [
    ...new Set(
      (adjustments ?? [])
        .map((a) => (a as { created_by?: string | null }).created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const creatorNames = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await createServiceClient()
      .from("profiles")
      .select("id, full_name, email")
      .in("id", creatorIds);
    for (const p of profiles ?? []) {
      creatorNames.set(
        String(p.id),
        String(p.full_name || p.email || "").trim(),
      );
    }
  }

  // Link each payroll line to the manual adjustment behind it: by
  // applied_line_id when set, otherwise same employee + code + amount.
  type AdjustmentRow = NonNullable<typeof adjustments>[number] & {
    run_employee_id?: string | null;
    code?: string | null;
    reason?: string | null;
    applied_line_id?: string | null;
    created_by?: string | null;
    created_at?: string | null;
  };
  const toDetail = (a: AdjustmentRow): LineAdjustmentDetail => ({
    reason: String(a.reason ?? "").trim(),
    daysApplied: a.days_applied != null ? Number(a.days_applied) : null,
    percentOfDailyRate:
      a.percent_of_daily_rate != null ? Number(a.percent_of_daily_rate) : null,
    enteredBy: a.created_by ? (creatorNames.get(a.created_by) ?? null) : null,
    enteredOn: a.created_at ? String(a.created_at).slice(0, 10) : null,
  });
  const adjustmentByLineId = new Map<string, LineAdjustmentDetail>();
  const unmatched = [...((adjustments ?? []) as AdjustmentRow[])];
  for (const a of unmatched.filter((row) => row.applied_line_id)) {
    adjustmentByLineId.set(String(a.applied_line_id), toDetail(a));
  }
  const pool = unmatched.filter((row) => !row.applied_line_id);
  for (const line of (savedLines ?? []) as SavedPayrollLine[]) {
    if (adjustmentByLineId.has(line.id)) continue;
    const lineAmount = Math.round(Math.abs(Number(line.amount) || 0) * 100);
    const index = pool.findIndex(
      (a) =>
        a.run_employee_id === line.run_employee_id &&
        a.category === line.category &&
        String(a.code ?? "").toUpperCase() ===
          String(line.code ?? "").toUpperCase() &&
        Math.round(Math.abs(Number(a.amount) || 0) * 100) === lineAmount,
    );
    if (index < 0) continue;
    adjustmentByLineId.set(line.id, toDetail(pool[index]!));
    pool.splice(index, 1);
  }

  const monthKey = String(run.payroll_month).slice(0, 7);
  const [year, monthNum] = monthKey.split("-").map(Number);
  const payrollMonthLabel =
    Number.isFinite(year) && Number.isFinite(monthNum)
      ? new Date(year, monthNum - 1, 1).toLocaleString("en-GB", {
          month: "long",
          year: "numeric",
        })
      : monthKey;

  const staffIds = [
    ...new Set((employees ?? []).map((e) => String(e.staff_id))),
  ];
  const joiningDateByStaff: Record<string, string | null> = {};
  if (staffIds.length > 0) {
    const { data: staffRows } = await opts.supabase
      .from("staff")
      .select("id, joining_date")
      .in("id", staffIds);
    for (const row of staffRows ?? []) {
      joiningDateByStaff[String(row.id)] =
        (row.joining_date as string | null) ?? null;
    }
  }

  const companyName = payrollCompanyLegalName(opts.venueName);
  const payrollSettings = await loadPayrollSettings(opts.supabase, opts.venueId);

  const { buffer, rows, justifications, errors } = await buildPayrollExport({
    companyName,
    payrollMonthLabel,
    employees: (employees ?? []).map((e) =>
      mapRunEmployeeToCalcLike(
        e as Parameters<typeof mapRunEmployeeToCalcLike>[0],
        (savedLines ?? []) as SavedPayrollLine[],
        adjustmentByLineId,
      ),
    ),
    noBankPaymentMethod: payrollSettings.noBankPaymentMethod,
    joiningDateByStaff,
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
    justifications,
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
