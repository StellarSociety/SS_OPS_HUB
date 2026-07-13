import { StaffDatabase } from "@/components/hr/staff-database";
import { canViewSalary, maskSensitiveStaffFields } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  getHrVenueSetting,
  listDepartments,
  listEmploymentStatuses,
  listNationalities,
  listPositions,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";

export default async function StaffDatabaseTablePage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  const [staff, departments, positions, statuses, nationalities, salaryDefaults] =
    await Promise.all([
      listStaffForVenue(supabase, venue.id),
      listDepartments(supabase, venue.id),
      listPositions(supabase, venue.id),
      listEmploymentStatuses(supabase),
      listNationalities(supabase),
      getHrVenueSetting(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.salaryDefaults,
        DEFAULT_HR_SALARY_DEFAULTS,
      ),
    ]);

  const showSalary = canViewSalary(permissions, venue.id);
  const rows = showSalary
    ? staff
    : staff.map((s) => maskSensitiveStaffFields(s, permissions, venue.id));

  return (
    <StaffDatabase
      staff={rows}
      departments={departments}
      positions={positions}
      statuses={statuses}
      nationalities={nationalities}
      salaryPct={{
        basic: salaryDefaults.basicPct,
        accom: salaryDefaults.accomPct,
        transp: salaryDefaults.transpPct,
      }}
      canViewSalary={showSalary}
    />
  );
}
