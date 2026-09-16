import { getRenderUser } from "@/lib/auth/render-user";
import {
  currentMonthKey,
  isValidMonthKey,
  rangeForMonthKey,
} from "@/lib/hr/attendance-months";
import {
  calendarDateKeyInTimezone,
  rosterLabelKeepsShiftTimes,
  type ScheduleDayLabel,
  type ShiftTemplate,
} from "@/lib/hr/schedules";
import {
  getHrVenueSetting,
  listAttendanceDaysForStaff,
  listPublicHolidays,
  listScheduleDayLabels,
  listScheduleDaysByDateRange,
  listShiftTemplates,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type MobileAttendanceDay = {
  workDate: string;
  rosterLabel: string | null;
  rosterName: string | null;
  rosterAbbreviation: string | null;
  rosterBgColor: string | null;
  rosterTextColor: string | null;
  rosterBorderColor: string | null;
  shiftName: string | null;
  scheduleTime: string | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number | null;
  attendanceStatus: string | null;
  approvalStatus: string | null;
  holidayName: string | null;
  notes: string | null;
  issue: string | null;
};

export type MobileAttendanceMonth = {
  monthKey: string;
  timezone: string;
  linked: boolean;
  joiningDate: string | null;
  terminationDate: string | null;
  days: MobileAttendanceDay[];
};

type AttendanceSourceDay = {
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  status: string | null;
  approval_status: string | null;
  notes?: string | null;
};

type ScheduleSourceDay = {
  work_date: string;
  label_code: string;
  shift_template_id: string | null;
  notes?: string | null;
};

function formatScheduleTime(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  if (!startTime || !endTime) return null;
  return `${startTime} – ${endTime}`;
}

export function emptyAttendanceMonth(monthKey: string): MobileAttendanceMonth {
  const key = isValidMonthKey(monthKey) ? monthKey : currentMonthKey();
  return {
    monthKey: key,
    timezone: DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
    linked: false,
    joiningDate: null,
    terminationDate: null,
    days: [],
  };
}

export function buildMobileAttendanceDays(input: {
  attendance: AttendanceSourceDay[];
  roster: ScheduleSourceDay[];
  templates: ShiftTemplate[];
  labels: ScheduleDayLabel[];
  holidays: { holidayDate: string; name: string }[];
  timezone: string;
  todayKey: string;
}): MobileAttendanceDay[] {
  const templatesById = new Map(input.templates.map((row) => [row.id, row]));
  const labelsByCode = new Map(
    input.labels.map((row) => [row.code.trim().toUpperCase(), row]),
  );
  const holidaysByDate = new Map(
    input.holidays.map((row) => [row.holidayDate.slice(0, 10), row.name]),
  );
  const rosterByDate = new Map(
    input.roster.map((row) => [row.work_date.slice(0, 10), row]),
  );
  const attendanceByDate = new Map(
    input.attendance.map((row) => [row.work_date.slice(0, 10), row]),
  );

  const dates = [
    ...new Set([...rosterByDate.keys(), ...attendanceByDate.keys()]),
  ].sort();

  function scheduleTimesFor(
    labelCode: string | null | undefined,
    shiftTemplateId: string | null | undefined,
  ) {
    if (!rosterLabelKeepsShiftTimes(labelCode) || !shiftTemplateId) {
      return {
        shiftName: null,
        scheduleTime: null,
        scheduleStartTime: null,
        scheduleEndTime: null,
      };
    }
    const template = templatesById.get(shiftTemplateId);
    const start = template?.startTime ?? null;
    const end = template?.endTime ?? null;
    return {
      shiftName: template?.name ?? null,
      scheduleTime: formatScheduleTime(start, end),
      scheduleStartTime: start,
      scheduleEndTime: end,
    };
  }

  function labelStyle(code: string | null | undefined) {
    if (!code) {
      return {
        rosterName: null,
        rosterAbbreviation: null,
        rosterBgColor: null,
        rosterTextColor: null,
        rosterBorderColor: null,
      };
    }
    const label = labelsByCode.get(code.trim().toUpperCase());
    return {
      rosterName: label?.name ?? code,
      rosterAbbreviation: label?.abbreviation ?? code,
      rosterBgColor: label?.bgColor ?? null,
      rosterTextColor: label?.textColor ?? null,
      rosterBorderColor: label?.borderColor ?? null,
    };
  }

  return dates.map((workDate) => {
    const planned = rosterByDate.get(workDate) ?? null;
    const day = attendanceByDate.get(workDate) ?? null;
    const future = Boolean(input.todayKey) && workDate > input.todayKey;
    const schedule = scheduleTimesFor(
      planned?.label_code,
      planned?.shift_template_id,
    );
    const style = labelStyle(planned?.label_code ?? null);
    let issue: string | null = null;

    if (!future) {
      if (planned?.label_code === "SHIFT" && day?.status && day.status !== "complete") {
        issue = "Scheduled shift with incomplete attendance";
      } else if (
        planned &&
        planned.label_code !== "SHIFT" &&
        (day?.clock_in || day?.clock_out)
      ) {
        issue = `Punches on roster day “${planned.label_code}”`;
      } else if (!planned && (day?.clock_in || day?.clock_out)) {
        issue = "Attendance with no roster day";
      } else if (day?.status === "missing_clock_out") {
        issue = "Missing clock out";
      } else if (day?.status === "missing_clock_in") {
        issue = "Missing clock in";
      } else if (planned?.label_code === "SHIFT" && !day) {
        issue = "Scheduled shift with no attendance";
      }
    }

    return {
      workDate,
      rosterLabel: planned?.label_code ?? null,
      ...style,
      ...schedule,
      clockIn: future ? null : (day?.clock_in ?? null),
      clockOut: future ? null : (day?.clock_out ?? null),
      totalHours: future ? null : (day?.total_hours ?? null),
      attendanceStatus: future ? null : (day?.status ?? null),
      approvalStatus: day?.approval_status ?? null,
      holidayName: holidaysByDate.get(workDate) ?? null,
      notes: planned?.notes?.trim() || day?.notes?.trim() || null,
      issue,
    };
  });
}

export async function loadMobileStaffAttendanceMonth(opts: {
  staffId: string;
  venueId: string;
  monthKey: string;
}): Promise<MobileAttendanceMonth> {
  const monthKey = isValidMonthKey(opts.monthKey)
    ? opts.monthKey
    : currentMonthKey();
  const empty = emptyAttendanceMonth(monthKey);
  const staffId = opts.staffId.trim();
  if (!staffId) return empty;

  const service = createServiceClient();
  const { fromDate, toDate } = rangeForMonthKey(monthKey);

  const { data: staff } = await service
    .from("staff")
    .select("id, emp_no, joining_date, termination_date")
    .eq("id", staffId)
    .maybeSingle();

  if (!staff?.id) return empty;
  const empNo = String(staff.emp_no ?? "").trim();
  const joiningDate = staff.joining_date
    ? String(staff.joining_date).slice(0, 10)
    : null;
  const terminationDate = staff.termination_date
    ? String(staff.termination_date).slice(0, 10)
    : null;

  const [attendance, roster, templates, labels, holidays, importRules] =
    await Promise.all([
      listAttendanceDaysForStaff(service, opts.venueId, {
        staffIds: [staff.id],
        empNos: empNo ? [empNo] : [],
        fromDate,
        toDate,
      }),
      listScheduleDaysByDateRange(service, opts.venueId, {
        fromDate,
        toDate,
        staffIds: [staff.id],
        empNos: empNo ? [empNo] : [],
      }),
      listShiftTemplates(service, opts.venueId, { includeInactive: true }),
      listScheduleDayLabels(service),
      listPublicHolidays(service, opts.venueId, { fromDate, toDate }),
      getHrVenueSetting<HrAttendanceImportRules>(
        service,
        opts.venueId,
        HR_SETTINGS_KEYS.attendanceImportRules,
        DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
      ),
    ]);

  const timezone =
    importRules.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone;
  const todayKey = calendarDateKeyInTimezone(new Date().toISOString(), timezone);

  return {
    monthKey,
    timezone,
    linked: true,
    joiningDate,
    terminationDate,
    days: buildMobileAttendanceDays({
      attendance,
      roster,
      templates: templates ?? [],
      labels: labels ?? [],
      holidays: holidays ?? [],
      timezone,
      todayKey,
    }),
  };
}

export async function loadMobileEmployeeAttendanceMonth(opts: {
  userId: string;
  venueId: string;
  monthKey: string;
}): Promise<MobileAttendanceMonth> {
  const monthKey = isValidMonthKey(opts.monthKey)
    ? opts.monthKey
    : currentMonthKey();
  const empty = emptyAttendanceMonth(monthKey);
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("staff_id")
    .eq("id", opts.userId)
    .maybeSingle();

  const staffId = (profile?.staff_id as string | null | undefined)?.trim() || null;
  if (!staffId) return empty;

  return loadMobileStaffAttendanceMonth({
    staffId,
    venueId: opts.venueId,
    monthKey,
  });
}

export async function loadCurrentUserAttendanceMonth(opts: {
  venueId: string;
  monthKey?: string | null;
}): Promise<MobileAttendanceMonth> {
  const monthKey =
    opts.monthKey && isValidMonthKey(opts.monthKey)
      ? opts.monthKey
      : currentMonthKey();
  const user = await getRenderUser();
  if (!user) return emptyAttendanceMonth(monthKey);

  return loadMobileEmployeeAttendanceMonth({
    userId: user.id,
    venueId: opts.venueId,
    monthKey,
  });
}
