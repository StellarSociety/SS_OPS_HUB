import { BenefitDeductionsPanel } from "@/components/hr/benefit-deductions-panel";
import {
  listBenefitDeductions,
  loadBenefitPayoutMap,
} from "@/lib/hr/benefits/deduction-payouts";
import type { BenefitDeductionStaffOption } from "@/lib/hr/benefits";
import { deductionStaffOf } from "@/lib/hr/benefits/deductions";
import { loadPayrollDeductionProgress } from "@/lib/hr/benefits/payroll-deduction-charges";
import { createServiceClient } from "@/lib/supabase/service";
import { canEditBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listDepartments, listStaffForVenue } from "@/lib/hr/store";

export default async function HrBenefitsDeductionsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEdit = canEditBenefits(permissions, venue.id);

  const [staffRows, departmentRows, payoutData, deductionList] = await Promise.all(
    [
      listStaffForVenue(supabase, venue.id),
      listDepartments(supabase, venue.id),
      loadBenefitPayoutMap(supabase, venue.id),
      listBenefitDeductions(supabase, venue.id),
    ],
  );

  const payrollProgress = await loadPayrollDeductionProgress({
    service: createServiceClient(),
    venueId: venue.id,
    deductions: deductionList.rows
      .filter((entry) => entry.benefitKind === "payroll")
      .map((entry) => ({ id: entry.id, staff: deductionStaffOf(entry) })),
  });

  const staff: BenefitDeductionStaffOption[] = staffRows.map((row) => ({
    id: row.id,
    empNo: row.emp_no,
    fullName: row.full_name,
    photoUrl: row.photo_url,
    departmentId: row.department_id,
    departmentName: row.department?.name ?? null,
    positionName: row.position?.name ?? null,
    employmentStatusName: row.employment_status?.name ?? null,
  }));

  const departments = departmentRows.map((row) => ({
    id: row.id,
    name: row.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Deductions</h2>
        <p className="text-sm text-black/55">
          Recover a named amount from gratuity, service charge or payroll.
          Gratuity and service charge: each month’s installment is split
          equally across the people on that month’s benefit run (a department,
          or selected people who appear on it); if the run cannot cover it,
          leftover rolls to later months. Payroll: the total is split equally
          when saved and each person’s share is deducted from their salary
          over the chosen months (Payroll → Import Deductions).
        </p>
      </div>

      {deductionList.migrationRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Database migration required</p>
          <p className="mt-1 text-amber-900/80">
            Apply{" "}
            <code className="rounded bg-white/70 px-1">
              supabase/migrations/20260825214611_hr_benefit_deductions.sql
            </code>{" "}
            then refresh this page.
          </p>
        </div>
      ) : null}

      <BenefitDeductionsPanel
        canEdit={canEdit && !deductionList.migrationRequired}
        staff={staff}
        departments={departments}
        payouts={payoutData.payouts}
        rosters={payoutData.rosters}
        entries={deductionList.rows}
        payrollProgress={payrollProgress}
      />
    </div>
  );
}
