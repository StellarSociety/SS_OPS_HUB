import { OffboardingProcessForm } from "@/components/hr/offboarding-process-form";
import { canEditStaff, canViewStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import type { OffboardingStaffSnapshot } from "@/lib/hr/offboarding-process";
import {
  listEmploymentStatuses,
  listStaffForVenue,
} from "@/lib/hr/store";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ staffId?: string }>;
};

export default async function HrOffboardingStartPage({ searchParams }: PageProps) {
  const { supabase, venue, permissions } = await getHrPageContext();
  const params = await searchParams;
  const staffId = params.staffId?.trim() ?? "";

  if (!canViewStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to view offboarding for this venue.
      </p>
    );
  }

  if (!canEditStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to start offboarding for this venue.
      </p>
    );
  }

  if (!staffId) {
    redirect("/hr/offboarding");
  }

  const [staff, employmentStatuses] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    listEmploymentStatuses(supabase),
  ]);
  const member = staff.find((s) => s.id === staffId);
  if (!member) {
    redirect("/hr/offboarding");
  }

  const snapshot: OffboardingStaffSnapshot = {
    id: member.id,
    empNo: member.emp_no,
    fullName: member.full_name,
    departmentName: member.department?.name ?? null,
    positionName: member.position?.name ?? null,
    employmentStatusId: member.employment_status_id,
    employmentStatusName: member.employment_status?.name ?? null,
    joiningDate: member.joining_date,
    terminationDate: member.termination_date,
    terminationType: member.termination_type,
    wagePackage: member.wage_package,
    basicSalary: member.basic_salary_60,
    provisionalEosb: member.provisional_eosb,
    workEmail: member.work_email,
    personalEmail: member.personal_email,
    alBalance: 0,
    phBalance: 0,
  };

  return (
    <OffboardingProcessForm
      staff={snapshot}
      employmentStatuses={employmentStatuses}
    />
  );
}
