import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  PayrollRunClient,
  type PayrollAdjustmentRow,
  type PayrollEmployeeRow,
  type PayrollEventRow,
  type PayrollExceptionRow,
  type PayrollLineRow,
  type PayrollPaymentRow,
  type PayrollRunRow,
  type PayrollSettlementRow,
  type PayrollStaffOption,
} from "@/components/hr/payroll-run-client";
import { PayrollShell } from "@/components/hr/payroll-shell";
import {
  canAccessPayroll,
  canEditPayroll,
  canViewSalary,
} from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { parsePayrollRunTab } from "@/lib/hr/payroll";

type Props = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function HrPayrollRunPage({
  params,
  searchParams,
}: Props) {
  const { runId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = parsePayrollRunTab(tabParam);

  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canAccessPayroll(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Payroll for this venue.
        </p>
      </div>
    );
  }

  const showSalary = canViewSalary(permissions, venue.id);
  const canEdit = canEditPayroll(permissions, venue.id);

  const { data: run, error: runError } = await supabase
    .from("hr_payroll_runs")
    .select(
      "id, payroll_month, period_start, period_end, payment_date, status, budget_amount, revenue_amount, totals, notes",
    )
    .eq("venue_id", venue.id)
    .eq("id", runId)
    .maybeSingle();

  if (runError) {
    console.error("[hr/payroll/run] load:", runError.message);
  }
  if (!run) notFound();

  const [
    employeesRes,
    linesRes,
    exceptionsRes,
    adjustmentsRes,
    settlementsRes,
    paymentsRes,
    eventsRes,
  ] = await Promise.all([
    supabase
      .from("hr_payroll_run_employees")
      .select(
        "id, staff_id, emp_no, full_name, department_name, included, exclude_reason, is_new_joiner, is_leaver, paid_days, unpaid_days, basic_salary, accom_allowance, transp_allowance, fixed_earnings, variable_earnings, total_deductions, net_salary, snapshot",
      )
      .eq("run_id", runId)
      .order("emp_no"),
    tab === "run"
      ? supabase
          .from("hr_payroll_lines")
          .select(
            "id, run_employee_id, category, code, label, amount, sort_order",
          )
          .eq("run_id", runId)
          .order("sort_order")
      : Promise.resolve({ data: [] as PayrollLineRow[], error: null }),
    tab === "exceptions" || tab === "run"
      ? supabase
          .from("hr_payroll_exceptions")
          .select(
            "id, emp_no, severity, exception_type, message, work_date, waived, waive_comment",
          )
          .eq("run_id", runId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as PayrollExceptionRow[], error: null }),
    tab === "adjustments"
      ? supabase
          .from("hr_payroll_adjustments")
          .select(
            "id, staff_id, category, code, label, amount, percent_of_daily_rate, days_applied, reason, created_at",
          )
          .eq("run_id", runId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as PayrollAdjustmentRow[], error: null }),
    tab === "settlements"
      ? supabase
          .from("hr_payroll_settlements")
          .select(
            "id, run_employee_id, staff_id, termination_date, leave_encashment, outstanding_advances, eosb_amount, other_amount, net_settlement, include_in_run, notes",
          )
          .eq("run_id", runId)
      : Promise.resolve({ data: [] as PayrollSettlementRow[], error: null }),
    tab === "payments"
      ? supabase
          .from("hr_payroll_payments")
          .select(
            "id, run_employee_id, staff_id, wps_employee_id, iban, bank_name, fixed_salary, variable_salary, days_paid, leave_days, net_salary, payment_method, status",
          )
          .eq("run_id", runId)
      : Promise.resolve({ data: [] as PayrollPaymentRow[], error: null }),
    supabase
      .from("hr_payroll_run_events")
      .select("id, from_status, to_status, comment, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const employeesRaw = (employeesRes.data ?? []) as Array<
    Omit<PayrollEmployeeRow, "working_status" | "joining_date" | "termination_date" | "day_fractions"> & {
      snapshot?: {
        dayFractions?: PayrollEmployeeRow["day_fractions"];
        joiningDate?: string | null;
        terminationDate?: string | null;
      } | null;
    }
  >;

  const staffIds = [...new Set(employeesRaw.map((e) => e.staff_id))];
  const workingStatusByStaffId = new Map<string, string>();
  const joiningByStaffId = new Map<string, string | null>();
  const terminationByStaffId = new Map<string, string | null>();
  if (staffIds.length > 0) {
    const { data: staffStatuses, error: staffStatusError } = await supabase
      .from("staff")
      .select("id, joining_date, termination_date, working_status:working_statuses(name)")
      .in("id", staffIds);
    if (staffStatusError) {
      console.error(
        "[hr/payroll/run] working status:",
        staffStatusError.message,
      );
    } else {
      for (const row of staffStatuses ?? []) {
        const raw = row.working_status as
          | { name: string }
          | { name: string }[]
          | null;
        const name = Array.isArray(raw) ? raw[0]?.name : raw?.name;
        if (name) workingStatusByStaffId.set(row.id, name);
        joiningByStaffId.set(
          row.id,
          row.joining_date ? String(row.joining_date).slice(0, 10) : null,
        );
        terminationByStaffId.set(
          row.id,
          row.termination_date
            ? String(row.termination_date).slice(0, 10)
            : null,
        );
      }
    }
  }

  const employees: PayrollEmployeeRow[] = employeesRaw.map((e) => {
    const snap = e.snapshot ?? null;
    const snapJoining = snap?.joiningDate
      ? String(snap.joiningDate).slice(0, 10)
      : null;
    const snapTermination = snap?.terminationDate
      ? String(snap.terminationDate).slice(0, 10)
      : null;
    return {
      id: e.id,
      staff_id: e.staff_id,
      emp_no: e.emp_no,
      full_name: e.full_name,
      department_name: e.department_name,
      included: e.included,
      exclude_reason: e.exclude_reason,
      is_new_joiner: e.is_new_joiner,
      is_leaver: e.is_leaver,
      paid_days: e.paid_days,
      unpaid_days: e.unpaid_days,
      basic_salary:
        e.basic_salary != null && !Number.isNaN(Number(e.basic_salary))
          ? Number(e.basic_salary)
          : null,
      accom_allowance:
        e.accom_allowance != null && !Number.isNaN(Number(e.accom_allowance))
          ? Number(e.accom_allowance)
          : null,
      transp_allowance:
        e.transp_allowance != null && !Number.isNaN(Number(e.transp_allowance))
          ? Number(e.transp_allowance)
          : null,
      fixed_earnings: e.fixed_earnings,
      variable_earnings: e.variable_earnings,
      total_deductions: e.total_deductions,
      net_salary: e.net_salary,
      working_status: workingStatusByStaffId.get(e.staff_id) ?? null,
      joining_date:
        snapJoining ?? joiningByStaffId.get(e.staff_id) ?? null,
      termination_date:
        snapTermination ?? terminationByStaffId.get(e.staff_id) ?? null,
      day_fractions: Array.isArray(snap?.dayFractions)
        ? snap.dayFractions
        : [],
    };
  });

  const staffOptions: PayrollStaffOption[] = employees.map((e) => ({
    id: e.staff_id,
    emp_no: e.emp_no,
    full_name: e.full_name,
  }));

  const venueSubtitle = venue.is_global
    ? "Payroll across venues"
    : `${venue.name} payroll`;

  return (
    <Suspense
      fallback={
        <div className="text-sm text-black/50">Loading payroll run…</div>
      }
    >
      <PayrollShell venueSubtitle={venueSubtitle} runId={runId}>
        <PayrollRunClient
          tab={tab}
          run={run as PayrollRunRow}
          employees={employees}
          lines={(linesRes.data ?? []) as PayrollLineRow[]}
          exceptions={(exceptionsRes.data ?? []) as PayrollExceptionRow[]}
          adjustments={(adjustmentsRes.data ?? []) as PayrollAdjustmentRow[]}
          settlements={(settlementsRes.data ?? []) as PayrollSettlementRow[]}
          payments={(paymentsRes.data ?? []) as PayrollPaymentRow[]}
          events={(eventsRes.data ?? []) as PayrollEventRow[]}
          staffOptions={staffOptions}
          canViewSalary={showSalary}
          canEdit={canEdit}
        />
      </PayrollShell>
    </Suspense>
  );
}
