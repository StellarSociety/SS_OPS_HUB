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
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import {
  listPayrollApproverCandidates,
  listPendingPayrollApprovalsForRun,
} from "@/lib/actions/hr-payroll-approvals";
import {
  canAccessPayroll,
  canEditPayroll,
  canViewSalary,
} from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { parsePayrollRunTab, sumVenueNetRevenueForPeriod } from "@/lib/hr/payroll";
import { loadPayrollApprovalsSettingsForVenue } from "@/lib/hr/payroll/approvals-settings";
import type { PayrollPeriodNetRevenue } from "@/lib/hr/payroll/period-revenue";
import { loadPayrollAdjustmentCodes } from "@/lib/hr/payroll/persist-run";
import { createServiceClient } from "@/lib/supabase/service";

type Props = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export const dynamic = "force-dynamic";

export default async function HrPayrollRunPage({
  params,
  searchParams,
}: Props) {
  const { runId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = parsePayrollRunTab(tabParam);

  const { supabase, venue, permissions, user } = await getHrPageContext();

  if (!canAccessPayroll(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const showSalary = canViewSalary(permissions, venue.id);
  const canEdit = canEditPayroll(permissions, venue.id);
  const payrollDataClient =
    canEdit || showSalary ? createServiceClient() : supabase;

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
    payslipsRes,
    adjustmentCodes,
    approvalsSettings,
    candidatesResult,
    pendingApprovals,
  ] = await Promise.all([
    supabase
      .from("hr_payroll_run_employees")
      .select(
        "id, staff_id, emp_no, full_name, department_name, included, exclude_reason, is_new_joiner, is_leaver, paid_days, unpaid_days, daily_rate, basic_salary, accom_allowance, transp_allowance, salary_to_pay, fixed_earnings, variable_earnings, total_deductions, net_salary, snapshot",
      )
      .eq("run_id", runId)
      .order("emp_no"),
    supabase
      .from("hr_payroll_lines")
      .select(
        "id, run_employee_id, category, code, label, amount, quantity, sort_order, source",
      )
      .eq("run_id", runId)
      .order("sort_order"),
    supabase
      .from("hr_payroll_exceptions")
      .select(
        "id, emp_no, severity, exception_type, message, work_date, waived, waive_comment",
      )
      .eq("run_id", runId)
      .neq("exception_type", "missing_wps_id")
      .order("created_at", { ascending: false }),
    payrollDataClient
      .from("hr_payroll_adjustments")
      .select(
        "id, staff_id, category, code, label, amount, percent_of_daily_rate, days_applied, reason, created_at, bulk_group_id",
      )
      .eq("run_id", runId)
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false }),
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
      .select("id, from_status, to_status, comment, created_at, actor_id")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("hr_payslips")
      .select("id, run_employee_id, version")
      .eq("run_id", runId)
      .eq("venue_id", venue.id)
      .order("version", { ascending: false }),
    loadPayrollAdjustmentCodes(supabase, venue.id),
    loadPayrollApprovalsSettingsForVenue(supabase, venue.id),
    listPayrollApproverCandidates(),
    listPendingPayrollApprovalsForRun(runId),
  ]);

  if (adjustmentsRes.error) {
    console.error(
      "[hr/payroll/run] adjustments:",
      adjustmentsRes.error.message,
    );
  }
  if (payslipsRes.error) {
    console.error("[hr/payroll/run] payslips:", payslipsRes.error.message);
  }

  const latestPayslipByEmployee = new Map<
    string,
    { id: string; version: number }
  >();
  for (const row of payslipsRes.data ?? []) {
    const empId = row.run_employee_id as string;
    if (!latestPayslipByEmployee.has(empId)) {
      latestPayslipByEmployee.set(empId, {
        id: row.id as string,
        version: Number(row.version) || 1,
      });
    }
  }

  const employeesRaw = (employeesRes.data ?? []) as Array<
    Omit<
      PayrollEmployeeRow,
      | "working_status"
      | "joining_date"
      | "termination_date"
      | "day_fractions"
      | "effective_paid_days"
      | "payslip_id"
      | "payslip_version"
    > & {
      snapshot?: {
        dayFractions?: PayrollEmployeeRow["day_fractions"];
        effectivePaidDays?: number;
        joiningDate?: string | null;
        terminationDate?: string | null;
        workingStatus?: string | null;
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
    const snapWorkingStatus = snap?.workingStatus?.trim() || null;
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
      effective_paid_days:
        snap?.effectivePaidDays != null &&
        !Number.isNaN(Number(snap.effectivePaidDays))
          ? Number(snap.effectivePaidDays)
          : Number(e.paid_days),
      unpaid_days: e.unpaid_days,
      daily_rate:
        e.daily_rate != null && !Number.isNaN(Number(e.daily_rate))
          ? Number(e.daily_rate)
          : null,
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
      salary_to_pay:
        e.salary_to_pay != null && !Number.isNaN(Number(e.salary_to_pay))
          ? Number(e.salary_to_pay)
          : null,
      fixed_earnings: e.fixed_earnings,
      variable_earnings: e.variable_earnings,
      total_deductions: e.total_deductions,
      net_salary: e.net_salary,
      working_status:
        snapWorkingStatus ??
        workingStatusByStaffId.get(e.staff_id) ??
        null,
      joining_date:
        snapJoining ?? joiningByStaffId.get(e.staff_id) ?? null,
      termination_date:
        snapTermination ?? terminationByStaffId.get(e.staff_id) ?? null,
      day_fractions: Array.isArray(snap?.dayFractions)
        ? snap.dayFractions
        : [],
      payslip_id: latestPayslipByEmployee.get(e.id)?.id ?? null,
      payslip_version: latestPayslipByEmployee.get(e.id)?.version ?? null,
    };
  });

  const adjustments: PayrollAdjustmentRow[] = (adjustmentsRes.data ?? []).map(
    (a) => ({
      id: a.id as string,
      staff_id: a.staff_id as string,
      category: a.category as string,
      code: a.code as string,
      label: a.label as string,
      amount: Number(a.amount),
      percent_of_daily_rate:
        a.percent_of_daily_rate != null
          ? Number(a.percent_of_daily_rate)
          : null,
      days_applied:
        a.days_applied != null ? Number(a.days_applied) : null,
      reason: (a.reason as string) ?? "",
      created_at: a.created_at as string,
      bulk_group_id:
        a.bulk_group_id != null ? (a.bulk_group_id as string) : null,
    }),
  );

  const staffOptions: PayrollStaffOption[] = employees.map((e) => ({
    id: e.staff_id,
    emp_no: e.emp_no,
    full_name: e.full_name,
  }));

  const eventsRaw = (eventsRes.data ?? []) as Array<
    PayrollEventRow & { actor_id?: string | null }
  >;
  const actorIds = [
    ...new Set(
      [
        ...eventsRaw.map((e) => e.actor_id),
        ...pendingApprovals.flatMap((a) => [
          a.approved_by,
          a.requested_by,
          ...(a.approver_user_ids ?? []),
        ]),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const actorNameById = new Map<string, string>();
  for (const c of candidatesResult.candidates ?? []) {
    actorNameById.set(c.id, c.fullName);
  }
  if (actorIds.length > 0) {
    const missing = actorIds.filter((id) => !actorNameById.has(id));
    if (missing.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missing);
      for (const p of profiles ?? []) {
        actorNameById.set(
          p.id as string,
          String(p.full_name ?? "").trim() || String(p.email ?? "User"),
        );
      }
    }
  }
  const events: PayrollEventRow[] = eventsRaw.map((e) => ({
    ...e,
    actor_name: e.actor_id ? (actorNameById.get(e.actor_id) ?? null) : null,
  }));
  const userNames = Object.fromEntries(actorNameById);

  let periodNetRevenue: PayrollPeriodNetRevenue | null = null;
  if (showSalary || canEdit) {
    try {
      periodNetRevenue = await sumVenueNetRevenueForPeriod(
        createServiceClient(),
        venue.id,
        String(run.period_start).slice(0, 10),
        String(run.period_end).slice(0, 10),
      );
    } catch (err) {
      console.error(
        "[hr/payroll/run] period revenue:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const venueSubtitle = venue.is_global
    ? "Payroll across venues"
    : `${venue.name} payroll`;

  return (
    <Suspense
      fallback={
        <div className="text-sm text-black/50">Loading payroll run…</div>
      }
    >
      <PayrollShell
        venueSubtitle={venueSubtitle}
        runId={runId}
        runStatus={String(run.status)}
        canEdit={canEdit}
      >
        <PayrollRunClient
          tab={tab}
          run={run as PayrollRunRow}
          employees={employees}
          lines={(linesRes.data ?? []) as PayrollLineRow[]}
          exceptions={(exceptionsRes.data ?? []) as PayrollExceptionRow[]}
          adjustments={adjustments}
          settlements={(settlementsRes.data ?? []) as PayrollSettlementRow[]}
          payments={(paymentsRes.data ?? []) as PayrollPaymentRow[]}
          events={events}
          staffOptions={staffOptions}
          canViewSalary={showSalary}
          canEdit={canEdit}
          periodNetRevenue={periodNetRevenue}
          adjustmentCodes={adjustmentCodes}
          currentUserId={user.id}
          approvalsSettings={approvalsSettings}
          approvalCandidates={candidatesResult.candidates ?? []}
          pendingApprovals={pendingApprovals}
          userNames={userNames}
        />
      </PayrollShell>
    </Suspense>
  );
}
