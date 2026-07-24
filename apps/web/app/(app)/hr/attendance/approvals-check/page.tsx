import { AttendanceApprovalsCheckPanel } from "@/components/hr/attendance-approvals-check-panel";
import { attendanceDayRequiresApproval } from "@/lib/hr/attendance-approval";
import { currentMonthKey } from "@/lib/hr/attendance-months";
import {
  buildAttendanceValidationRows,
  validationEmployeeOptions,
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
    const rows = await buildAttendanceValidationRows(supabase, venue.id, {
      fromDate: period.periodStart,
      toDate: period.periodEnd,
    });

    const eligibleIds = new Set(
      validationEmployeeOptions(staff).map((e) => e.id),
    );
    const deptById = new Map(departments.map((d) => [d.id, d.name]));

    const pendingDays = rows
      .map((row) => {
        if (row.staffId && !eligibleIds.has(row.staffId)) return null;
        const need = attendanceDayRequiresApproval({
          rosterLabel: row.rosterLabel,
          approvalStatus: row.approvalStatus,
          workDate: row.workDate,
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
            Per employee, leave and worked days in the payroll period (
            {payrollSettings.periodStartDay} → {payrollSettings.periodEndDay}{" "}
            from Pay settings) that still need Validation approval. OFF and
            calendar PH are excluded; SHIFT only appears when punches are
            missing or outside the {rules.scheduleVarianceMinutes}-minute
            schedule tolerance.
          </p>
        </div>
        <AttendanceApprovalsCheckPanel
          days={pendingDays}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          payrollMonthInput={payrollMonthInputValue(period.payrollMonth)}
          periodStart={period.periodStart}
          periodEnd={period.periodEnd}
          periodLabel={formatPayrollMonthLabel(period.payrollMonth)}
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
