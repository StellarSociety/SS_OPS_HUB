import { AttendanceApprovalsTable } from "@/components/hr/attendance-approvals-table";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { validationEmployeeOptions } from "@/lib/hr/build-attendance-validation-rows";
import {
  canAccessAttendanceValidation,
  canApproveAttendance,
  canEditSchedules,
} from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  withFallbackScheduleLabelIds,
} from "@/lib/hr/schedules";
import {
  getHrVenueSetting,
  listDepartments,
  listPublicHolidays,
  listScheduleDayLabels,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";
import {
  mergePayrollSettings,
  type HrPayrollSettings,
} from "@/lib/hr/payroll";
import { getVenueLogoUrl } from "@/lib/venue/branding";

type PageProps = {
  searchParams?: Promise<{
    staffId?: string;
    from?: string;
    to?: string;
    payrollRunId?: string;
  }>;
};

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default async function AttendanceValidationPage({
  searchParams,
}: PageProps) {
  const params = (await searchParams) ?? {};
  const initialStaffId = params.staffId?.trim() || null;
  const payrollFrom = isIsoDate(params.from?.trim())
    ? params.from!.trim()
    : null;
  const payrollTo = isIsoDate(params.to?.trim()) ? params.to!.trim() : null;
  const payrollRunId = params.payrollRunId?.trim() || null;

  const { supabase, user, venue, permissions } = await getHrPageContext();
  if (!canAccessAttendanceValidation(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }
  const canEditRoster = canEditSchedules(permissions, venue.id);
  const canApprove = canApproveAttendance(permissions, venue.id);

  try {
    const holidayYear =
      Number((payrollFrom ?? "").slice(0, 4)) || new Date().getFullYear();

    const [
      staff,
      departments,
      scheduleLabels,
      publicHolidays,
      importRules,
      payrollRaw,
      profileResult,
    ] = await Promise.all([
      listStaffForVenue(supabase, venue.id).catch((err) => {
        console.error("[hr] validation listStaffForVenue:", err);
        return [];
      }),
      listDepartments(supabase, venue.id).catch((err) => {
        console.error("[hr] validation listDepartments:", err);
        return [];
      }),
      listScheduleDayLabels(supabase),
      listPublicHolidays(supabase, venue.id, {
        fromDate: `${holidayYear - 1}-01-01`,
        toDate: `${holidayYear + 1}-12-31`,
      }),
      getHrVenueSetting<HrAttendanceImportRules>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.attendanceImportRules,
        DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
      ),
      getHrVenueSetting<Partial<HrPayrollSettings>>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.payroll,
        {},
      ),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
    ]);

    const userDisplayName = buildExportUserLabel(
      profileResult.data?.full_name,
      profileResult.data?.email ?? user.email,
    );

    const departmentOptions = departments.map((d) => ({
      id: d.id,
      name: d.name,
    }));

    const labelOptions = (
      scheduleLabels ?? withFallbackScheduleLabelIds(DEFAULT_SCHEDULE_DAY_LABELS)
    ).map((label) => ({
      code: label.code,
      abbreviation: label.abbreviation,
      name: label.name,
      bgColor: label.bgColor,
      textColor: label.textColor,
      borderColor: label.borderColor,
    }));

    const publicHolidayByDate: Record<string, string> = {};
    for (const holiday of publicHolidays ?? []) {
      publicHolidayByDate[holiday.holidayDate] = holiday.name;
    }

    const rules = {
      ...DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
      ...importRules,
    };
    const payrollSettings = mergePayrollSettings(payrollRaw);
    const employees = validationEmployeeOptions(staff);

    return (
      <div className="space-y-4">
        {payrollRunId && payrollFrom && payrollTo ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#F0F3DD)]/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#3D421F]">
                Updating attendance for payroll
              </p>
              <p className="mt-0.5 text-xs text-black/55">
                Period {payrollFrom} → {payrollTo}. Approve days here, then
                return and recalculate the payroll run.
              </p>
            </div>
            <Link
              href={`/hr/payroll/${payrollRunId}`}
              className="inline-flex h-9 shrink-0 items-center rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] transition hover:bg-white/80"
            >
              Back to payroll
            </Link>
          </div>
        ) : null}
        <AttendanceApprovalsTable
          heading="Validation"
          description={`Select an employee and week(s) or a date range. Department is optional and narrows the employee list. Stage actions in three groups — duty (SH / OFF / PH-REPL), paid leave (AL / SL / ML / PL / BL), unpaid (UPL / ABS). On a public holiday date, OFF saves as calendar PH; working SH earns a PH-REPL credit automatically. ABS keeps the scheduled start/end (expected to work, did not attend). Save roster edits, then Approve Attendance. SHIFT days only need approval when clock in/out differ from schedule by more than ${rules.scheduleVarianceMinutes} minutes (or punches are missing). Leave and ABS need approval; OFF / calendar PH do not.`}
          rows={[]}
          departments={departmentOptions}
          employees={employees}
          scheduleLabels={labelOptions}
          publicHolidayByDate={publicHolidayByDate}
          canEditRoster={canEditRoster}
          canApprove={canApprove}
          initialStaffId={initialStaffId}
          initialFromDate={payrollFrom}
          initialToDate={payrollTo}
          scheduleVarianceMinutes={rules.scheduleVarianceMinutes}
          timezone={rules.timezone}
          payrollPeriodStartDay={payrollSettings.periodStartDay}
          payrollPeriodEndDay={payrollSettings.periodEndDay}
          venueName={venue.name}
          venueLogoUrl={getVenueLogoUrl(venue)}
          userDisplayName={userDisplayName}
        />
      </div>
    );
  } catch (err) {
    console.error(
      "[hr] validation page render:",
      err instanceof Error ? err.message : err,
    );
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Validation</h2>
          <p className="mt-1 text-sm text-rose-700">
            Could not load attendance validation right now. Reload the page and
            try again.
          </p>
        </div>
      </div>
    );
  }
}
