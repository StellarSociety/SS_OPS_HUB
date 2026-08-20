import { SchedulesDepartmentTabs } from "@/components/hr/schedules-department-tabs";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { listConfiguredScheduleApprovers } from "@/lib/actions/hr-schedule-approval";
import { canEditSchedules } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  getMondayForWeekOffset,
  getWeekDayColumns,
  resolveScheduleDepartment,
  scheduleDaysToCellMap,
  withFallbackScheduleLabelIds,
  type ScheduleDepartmentKey,
  type ScheduleStaffRow,
} from "@/lib/hr/schedules";
import {
  listPublicHolidays,
  listScheduleDayLabels,
  listScheduleDaysByDateRange,
  listShiftTemplates,
  listStaffForVenue,
} from "@/lib/hr/store";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import type { PublicHoliday } from "@/lib/hr/types";

/**
 * Include anyone who has (or had) an employment window so historical weeks
 * still list terminated staff; per-week visibility uses joining/termination.
 */
const SCHEDULE_ELIGIBLE_STATUS_NAMES = new Set([
  "ON Board",
  "OFF Board",
  "OFF Boarding",
  "OUT",
]);
const DEFAULT_WORKING_STATUS = "Active";
const MISSING_POSITION_SORT = Number.MAX_SAFE_INTEGER;

function emptyStaffByDepartment(): Record<
  ScheduleDepartmentKey,
  ScheduleStaffRow[]
> {
  return {
    kitchen: [],
    bar: [],
    floor: [],
    office: [],
  };
}

function compareByPositionThenName(a: ScheduleStaffRow, b: ScheduleStaffRow) {
  if (a.positionSortOrder !== b.positionSortOrder) {
    return a.positionSortOrder - b.positionSortOrder;
  }
  return a.fullName.localeCompare(b.fullName);
}

export default async function SchedulesPage() {
  const { supabase, user, venue, permissions } = await getHrPageContext();
  const year = new Date().getFullYear();
  const currentMonday = getMondayForWeekOffset(0);
  const currentWeekDays = getWeekDayColumns(currentMonday);
  const currentFromDate = currentWeekDays[0]?.key ?? "";
  const currentToDate = currentWeekDays[6]?.key ?? "";
  const [staff, labelsFromDb, shiftTemplatesFromDb, publicHolidays, profileResult, configuredApprovers, currentWeekScheduleDays] =
    await Promise.all([
      listStaffForVenue(supabase, venue.id),
      listScheduleDayLabels(supabase),
      listShiftTemplates(supabase, venue.id),
      listPublicHolidays(supabase, venue.id, {
        fromDate: `${year - 1}-01-01`,
        toDate: `${year + 1}-12-31`,
      }),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
      listConfiguredScheduleApprovers(),
      currentFromDate && currentToDate
        ? listScheduleDaysByDateRange(supabase, venue.id, {
            fromDate: currentFromDate,
            toDate: currentToDate,
          })
        : Promise.resolve([]),
    ]);
  const canEdit = canEditSchedules(permissions, venue.id);
  const userDisplayName = buildExportUserLabel(
    profileResult.data?.full_name,
    profileResult.data?.email ?? user.email,
  );
  const approverPool = configuredApprovers.candidates ?? [];
  const labels =
    labelsFromDb && labelsFromDb.length > 0
      ? labelsFromDb
      : withFallbackScheduleLabelIds(DEFAULT_SCHEDULE_DAY_LABELS);
  const shiftTemplates = shiftTemplatesFromDb ?? [];
  const holidays: PublicHoliday[] = publicHolidays ?? [];
  const knownCodes = new Set(labels.map((label) => label.code));
  const initialWeekCells = scheduleDaysToCellMap(
    currentWeekScheduleDays,
    knownCodes,
  );
  const initialWeekKey =
    currentFromDate && currentToDate
      ? `days:${currentFromDate}:${currentToDate}`
      : null;

  const scheduleStaff = staff.filter((member) => {
    if (!member.joining_date?.trim()) return false;
    return SCHEDULE_ELIGIBLE_STATUS_NAMES.has(
      member.employment_status?.name ?? "",
    );
  });

  const staffByDepartment = emptyStaffByDepartment();

  for (const member of scheduleStaff) {
    const deptKey = resolveScheduleDepartment(member.department?.name);
    staffByDepartment[deptKey].push({
      id: member.id,
      fullName: member.full_name,
      empNo: member.emp_no,
      department: member.department?.name ?? null,
      position: member.position?.name ?? null,
      positionSortOrder: member.position?.sort_order ?? MISSING_POSITION_SORT,
      employeeStatus: member.employment_status?.name ?? null,
      workingStatus:
        member.working_status?.name?.trim() || DEFAULT_WORKING_STATUS,
      nationality: member.nationality?.name ?? null,
      dob: member.dob?.trim() || null,
      joiningDate: member.joining_date?.trim() || null,
      terminationDate: member.termination_date?.trim() || null,
      photoUrl: member.photo_url ?? null,
    });
  }

  for (const key of Object.keys(staffByDepartment) as ScheduleDepartmentKey[]) {
    staffByDepartment[key].sort(compareByPositionThenName);
  }

  return (
    <SchedulesDepartmentTabs
      staffByDepartment={staffByDepartment}
      labels={labels}
      shiftTemplates={shiftTemplates}
      publicHolidays={holidays}
      canEdit={canEdit}
      venueName={venue.name}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
      currentUserId={user.id}
      approverPool={approverPool}
      initialWeekCells={initialWeekCells}
      initialWeekKey={initialWeekKey}
    />
  );
}
