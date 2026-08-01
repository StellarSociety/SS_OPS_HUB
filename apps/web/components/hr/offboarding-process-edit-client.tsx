"use client";

import { useMemo } from "react";
import { OffboardingProcessForm } from "@/components/hr/offboarding-process-form";
import { isInAccommodation } from "@/lib/hr/derived";
import type {
  OffboardingProcess,
  OffboardingStaffSnapshot,
} from "@/lib/hr/offboarding-process";
import type { EmploymentStatus, StaffWithLookups } from "@/lib/hr/types";

type OffboardingProcessEditClientProps = {
  process: OffboardingProcess;
  staff: StaffWithLookups[];
  employmentStatuses: EmploymentStatus[];
};

export function OffboardingProcessEditClient({
  process,
  staff,
  employmentStatuses,
}: OffboardingProcessEditClientProps) {
  const staffById = useMemo(() => {
    const map = new Map<string, StaffWithLookups>();
    for (const member of staff) map.set(member.id, member);
    return map;
  }, [staff]);

  const member = staffById.get(process.staffId);
  const snapshot: OffboardingStaffSnapshot = member
    ? {
        id: member.id,
        empNo: member.emp_no,
        fullName: member.full_name,
        departmentName: member.department?.name ?? null,
        positionName: member.position?.name ?? null,
        employmentStatusId:
          process.employmentStatusId ?? member.employment_status_id,
        employmentStatusName:
          process.employmentStatusName ??
          member.employment_status?.name ??
          null,
        joiningDate: member.joining_date,
        terminationDate: member.termination_date,
        terminationType: member.termination_type,
        wagePackage: member.wage_package,
        basicSalary: member.basic_salary_60,
        provisionalEosb: member.provisional_eosb,
        workEmail: member.work_email,
        personalEmail: member.personal_email,
        inCompanyAccommodation: isInAccommodation(
          member.company_accommodation,
        ),
        alBalance: process.alBalance,
        phBalance: process.phBalance,
      }
    : {
        id: process.staffId,
        empNo: process.empNo,
        fullName: process.fullName,
        departmentName: process.departmentName,
        positionName: process.positionName,
        employmentStatusId: process.employmentStatusId,
        employmentStatusName: process.employmentStatusName,
        joiningDate: process.joiningDate,
        terminationDate: process.terminationDate,
        terminationType: null,
        wagePackage: null,
        basicSalary: null,
        provisionalEosb: null,
        workEmail: null,
        personalEmail: null,
        inCompanyAccommodation: false,
        alBalance: process.alBalance,
        phBalance: process.phBalance,
      };

  return (
    <OffboardingProcessForm
      staff={snapshot}
      employmentStatuses={employmentStatuses}
      initialProcess={process}
    />
  );
}
