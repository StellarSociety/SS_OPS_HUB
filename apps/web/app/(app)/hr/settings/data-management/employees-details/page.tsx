import { EmployeesDetailsImportPanel } from "@/components/hr/employees-details-import-panel";
import { Card } from "@/components/ui/card";
import {
  canEditStaff,
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
} from "@/lib/hr/store";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";

export default async function EmployeesDetailsDataManagementPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  try {
    const [
      staff,
      departments,
      positions,
      statuses,
      nationalities,
      genders,
      civilStatuses,
      salaryDefaults,
    ] = await Promise.all([
      listStaffForVenue(supabase, venue.id),
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
    ]);

    const showSalary = canViewSalary(permissions, venue.id);
    const rows = showSalary
      ? staff
      : staff.map((s) => maskSensitiveStaffFields(s, permissions, venue.id));

    return (
      <EmployeesDetailsImportPanel
        venueName={venue.name}
        canEdit={canEditStaff(permissions, venue.id)}
        staff={rows}
        lookups={{
          departments,
          positions,
          statuses,
          nationalities,
          genders,
          civilStatuses,
          salaryDefaults,
        }}
      />
    );
  } catch (error) {
    console.error("[hr/settings/data-management/employees-details]", error);

    return (
      <Card className="p-6">
        <h3 className="font-serif text-xl text-[#3D421F]">
          Could not load employee data
        </h3>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading employees for import and export. Refresh
          the page or try again in a moment.
        </p>
      </Card>
    );
  }
}
