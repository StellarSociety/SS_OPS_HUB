import { StaffEntryWorkspace } from "@/components/hr/staff-entry-workspace";
import {
  canEditStaff,
  canSubmitStaff,
  canViewSalary,
  maskSensitiveStaffFields,
} from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  getHrVenueSetting,
  listCivilStatuses,
  listDepartments,
  listEmploymentStatuses,
  listGenders,
  listNationalities,
  listPositions,
  listStaffForVenue,
  suggestNextEmpNo,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";

export default async function StaffEntryPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canSubmitStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to add staff for this venue.
      </p>
    );
  }

  if (venue.is_global) {
    return (
      <p className="text-sm text-black/60">
        Staff are added at a specific venue. Switch out of Global to create staff
        records.
      </p>
    );
  }

  const [
    departments,
    positions,
    statuses,
    nationalities,
    genders,
    civilStatuses,
    salaryDefaults,
    suggestedEmpNo,
    staff,
    activeOffboarding,
  ] = await Promise.all([
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
    listEmploymentStatuses(supabase),
    listNationalities(supabase),
    listGenders(supabase),
    listCivilStatuses(supabase),
    getHrVenueSetting(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.salaryDefaults,
      DEFAULT_HR_SALARY_DEFAULTS,
    ),
    suggestNextEmpNo(supabase, venue.id),
    listStaffForVenue(supabase, venue.id),
    supabase
      .from("hr_offboarding_processes")
      .select("id, staff_id")
      .eq("venue_id", venue.id)
      .not("status", "in", "(completed,cancelled)")
      .is("archived_at", null)
      .order("started_at", { ascending: false }),
  ]);

  const showSalary = canViewSalary(permissions, venue.id);
  const roster = showSalary
    ? staff
    : staff.map((s) => maskSensitiveStaffFields(s, permissions, venue.id));

  const offboardingByStaffId: Record<string, string> = {};
  for (const row of activeOffboarding.data ?? []) {
    const staffId = String(row.staff_id ?? "");
    const processId = String(row.id ?? "");
    if (staffId && processId && !offboardingByStaffId[staffId]) {
      offboardingByStaffId[staffId] = processId;
    }
  }

  return (
    <StaffEntryWorkspace
      departments={departments}
      positions={positions}
      statuses={statuses}
      nationalities={nationalities}
      genders={genders}
      civilStatuses={civilStatuses}
      salaryPct={{
        basic: salaryDefaults.basicPct,
        accom: salaryDefaults.accomPct,
        transp: salaryDefaults.transpPct,
      }}
      canViewSalary={showSalary}
      suggestedEmpNo={suggestedEmpNo}
      staff={roster}
      venueName={venue.name}
      offboardingByStaffId={offboardingByStaffId}
      canStartOffboarding={canEditStaff(permissions, venue.id)}
    />
  );
}
