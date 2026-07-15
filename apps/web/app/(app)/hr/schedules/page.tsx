import { SchedulesDepartmentTabs } from "@/components/hr/schedules-department-tabs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { canEditStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  matchesScheduleDepartment,
  SCHEDULE_DEPARTMENTS,
  withFallbackScheduleLabelIds,
  type ScheduleDepartmentKey,
  type ScheduleStaffRow,
} from "@/lib/hr/schedules";
import { listScheduleDayLabels, listShiftTemplates, listStaffForVenue } from "@/lib/hr/store";
import { getVenueLogoUrl } from "@/lib/venue/branding";

const ON_BOARD_STATUS_NAME = "ON Board";
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
  };
}

function compareByPositionThenName(a: ScheduleStaffRow, b: ScheduleStaffRow) {
  if (a.positionSortOrder !== b.positionSortOrder) {
    return a.positionSortOrder - b.positionSortOrder;
  }
  return a.fullName.localeCompare(b.fullName);
}

/** Best-effort Working Status map; safe before the lookup migration is applied. */
async function loadWorkingStatusByStaffId(
  supabase: SupabaseClient,
  staffIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (staffIds.length === 0) return map;

  const { data, error } = await supabase
    .from("staff")
    .select("id, working_status:working_statuses(name)")
    .in("id", staffIds);

  if (error || !data) return map;

  for (const row of data as {
    id: string;
    working_status: { name: string } | { name: string }[] | null;
  }[]) {
    const raw = row.working_status;
    const name = Array.isArray(raw) ? raw[0]?.name : raw?.name;
    if (name?.trim()) map.set(row.id, name.trim());
  }

  return map;
}

export default async function SchedulesPage() {
  const { supabase, user, venue, permissions } = await getHrPageContext();
  const [staff, labelsFromDb, shiftTemplatesFromDb, profileResult] =
    await Promise.all([
      listStaffForVenue(supabase, venue.id),
      listScheduleDayLabels(supabase),
      listShiftTemplates(supabase, venue.id),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
    ]);
  const canEdit = canEditStaff(permissions, venue.id);
  const userDisplayName = buildExportUserLabel(
    profileResult.data?.full_name,
    profileResult.data?.email ?? user.email,
  );
  const labels =
    labelsFromDb && labelsFromDb.length > 0
      ? labelsFromDb
      : withFallbackScheduleLabelIds(DEFAULT_SCHEDULE_DAY_LABELS);
  const shiftTemplates = shiftTemplatesFromDb ?? [];

  const onBoard = staff.filter(
    (member) => member.employment_status?.name === ON_BOARD_STATUS_NAME,
  );
  const workingStatusById = await loadWorkingStatusByStaffId(
    supabase,
    onBoard.map((member) => member.id),
  );

  const staffByDepartment = emptyStaffByDepartment();

  for (const member of onBoard) {
    for (const dept of SCHEDULE_DEPARTMENTS) {
      if (!matchesScheduleDepartment(member.department?.name, dept.key)) {
        continue;
      }
      staffByDepartment[dept.key].push({
        id: member.id,
        fullName: member.full_name,
        empNo: member.emp_no,
        position: member.position?.name ?? null,
        positionSortOrder:
          member.position?.sort_order ?? MISSING_POSITION_SORT,
        workingStatus:
          workingStatusById.get(member.id) ?? DEFAULT_WORKING_STATUS,
      });
    }
  }

  for (const key of Object.keys(staffByDepartment) as ScheduleDepartmentKey[]) {
    staffByDepartment[key].sort(compareByPositionThenName);
  }

  return (
    <SchedulesDepartmentTabs
      staffByDepartment={staffByDepartment}
      labels={labels}
      shiftTemplates={shiftTemplates}
      canEdit={canEdit}
      venueName={venue.name}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
    />
  );
}
