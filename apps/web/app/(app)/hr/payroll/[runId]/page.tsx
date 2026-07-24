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
        "id, staff_id, emp_no, full_name, department_name, included, exclude_reason, is_new_joiner, is_leaver, paid_days, unpaid_days, fixed_earnings, variable_earnings, total_deductions, net_salary",
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

  const employees = (employeesRes.data ?? []) as PayrollEmployeeRow[];
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
