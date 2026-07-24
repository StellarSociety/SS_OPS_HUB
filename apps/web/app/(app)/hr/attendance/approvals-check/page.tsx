import { AttendanceApprovalsCheckPanel } from "@/components/hr/attendance-approvals-check-panel";
import { attendanceDayRequiresApproval } from "@/lib/hr/attendance-approval";
import { currentMonthKey } from "@/lib/hr/attendance-months";
import {
  approvalsCheckScope,
  buildAttendanceValidationRows,
} from "@/lib/hr/build-attendance-validation-rows";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  formatPayrollMonthLabel,
  mergePayrollSettings,
  payrollMonthContainingDate,
  payrollMonthInputValue,
  resolvePayrollPeriod,
  type HrPayrollSettings,
} from "@/lib/hr/payroll";
import { isStaffEmployedOnWorkDate } from "@/lib/hr/schedules";
import {
  getHrVenueSetting,
  listDepartments,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";

type PageProps = {
  searchParams?: Promise<{ month?: string }>;
};

function isMonthInput(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function AttendanceApprovalsCheckPage({
  searchParams,
}: PageProps) {
  const params = (await searchParams) ?? {};
  const { supabase, venue } = await getHrPageContext();

  try {
    const [payrollRaw, importRules, staff, departments] = await Promise.all([
      getHrVenueSetting<Partial<HrPayrollSettings>>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.payroll,
        {},
      ),
      getHrVenueSetting<HrAttendanceImportRules>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.attendanceImportRules,
        DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
      ),
      listStaffForVenue(supabase, venue.id).catch((err) => {
        console.error("[hr] approvals-check listStaffForVenue:", err);
        return [];
      }),
      listDepartments(supabase, venue.id).catch((err) => {
        console.error("[hr] approvals-check listDepartments:", err);
        return [];
      }),
    ]);

    const payrollSettings = mergePayrollSettings(payrollRaw);
    const rules = {
      ...DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
      ...importRules,
    };

    const payrollMonth = isMonthInput(params.month?.trim())
      ? `${params.month!.trim()}-01`
      : payrollMonthContainingDate(todayIso(), payrollSettings);

    const period = resolvePayrollPeriod(payrollMonth, payrollSettings);
    const scope = approvalsCheckScope(staff, period);
    const employeeById = new Map(scope.employees.map((e) => [e.id, e]));
    const eligibleIds = new Set(scope.employees.map((e) => e.id));

    const rows = await buildAttendanceValidationRows(supabase, venue.id, {
      fromDate: scope.fromDate,
      toDate: scope.toDate,
    });

    const deptById = new Map(departments.map((d) => [d.id, d.name]));

    const pendingDays = rows
      .map((row) => {
        // Skip unmatched punches / schedule rows (e.g. emp "1", "2") that are
        // not linked to a registered employee in this payroll scope.
        if (!row.staffId || !eligibleIds.has(row.staffId)) return null;
        const employee = employeeById.get(row.staffId);
        if (!employee || !isStaffEmployedOnWorkDate(employee, row.workDate)) {
          return null;
        }
        const need = attendanceDayRequiresApproval({
          rosterLabel: row.rosterLabel,
          approvalStatus: row.approvalStatus,
          workDate: row.workDate,
          attendanceId: row.id,
          scheduleStart: row.scheduleStartTime,
          scheduleEnd: row.scheduleEndTime,
          clockIn: row.clockIn,
          clockOut: row.clockOut,
          issue: row.issue,
          timezone: rules.timezone,
          varianceMinutes: rules.scheduleVarianceMinutes,
        });
        if (!need.needs || !need.kind) return null;
        return {
          staffId: row.staffId,
          workDate: row.workDate,
          empNo: row.empNo,
          fullName: row.fullName,
          departmentId: row.departmentId,
          departmentName: row.departmentId
            ? (deptById.get(row.departmentId) ?? null)
            : null,
          rosterLabel: row.rosterLabel,
          kind: need.kind,
          reason: need.reason ?? "Needs approval",
          approvalStatus: row.approvalStatus,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d != null);

    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Approvals Check</h2>
          <p className="mt-1 text-sm text-black/55">
            Leave and worked days that still need Validation approval for staff
            whose termination date falls in the selected payroll month (
            {payrollSettings.periodStartDay} → {payrollSettings.periodEndDay}{" "}
            from Pay settings, including OUT). Active employees without a
            termination date are not listed. OFF, calendar PH, and in-tolerance
            SHIFT days are excluded. SHIFT only appears when an attendance row
            has missing punches or times outside the{" "}
            {rules.scheduleVarianceMinutes}-minute schedule tolerance
            (roster-only no-shows are not listed — mark ABS/leave in Validation
            first). If termination is after the usual period end, the date range
            extends through that day.
          </p>
        </div>
        <AttendanceApprovalsCheckPanel
          days={pendingDays}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          payrollMonthInput={payrollMonthInputValue(period.payrollMonth)}
          periodStartDay={payrollSettings.periodStartDay}
          periodEndDay={payrollSettings.periodEndDay}
          periodStart={scope.fromDate}
          periodEnd={scope.toDate}
          periodLabel={formatPayrollMonthLabel(period.payrollMonth)}
          periodExtended={scope.periodExtended}
          settingsPeriodEnd={period.periodEnd}
        />
      </div>
    );
  } catch (err) {
    console.error(
      "[hr] approvals-check page render:",
      err instanceof Error ? err.message : err,
    );
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Approvals Check</h2>
          <p className="mt-1 text-sm text-rose-700">
            Could not load approvals check right now. Reload the page and try
            again.
          </p>
          <p className="mt-1 text-xs text-black/40">
            Default month key: {currentMonthKey()}
          </p>
        </div>
      </div>
    );
  }
}
