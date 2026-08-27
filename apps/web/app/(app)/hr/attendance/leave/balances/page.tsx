import { Suspense } from "react";
import { LeaveBalancesClient } from "@/components/hr/leave-balances-client";
import {
  getEmployeeLeaveBalances,
  listLeaveBalanceSummaries,
} from "@/lib/actions/hr-leave";
import { currentLeaveYear } from "@/lib/hr/leave";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

type PageProps = {
  searchParams: Promise<{ year?: string; staffId?: string }>;
};

export default async function LeaveBalancesPage({ searchParams }: PageProps) {
  const { venue, permissions } = await getHrPageContext();
  const params = await searchParams;
  const nowYear = currentLeaveYear();
  const parsedYear = Number(params.year);
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : nowYear;

  const canManage =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const years = [nowYear - 1, nowYear, nowYear + 1];
  const staffId = params.staffId?.trim() || null;

  if (staffId) {
    const result = await getEmployeeLeaveBalances({
      staffId,
      leaveYear: year,
    });
    if (result.staff) {
      return (
        <Suspense fallback={<p className="text-sm text-black/50">Loading…</p>}>
          <LeaveBalancesClient
            year={year}
            years={years}
            summaries={[]}
            policy={result.policy}
            canManage={canManage}
            detail={{
              staff: result.staff,
              balances: result.balances,
              adjustments: result.adjustments,
              scheduledLeaves: result.scheduledLeaves,
              scheduleLabels: result.scheduleLabels,
              policy: result.policy,
              year: result.year,
              annualLeaveCalculation: result.annualLeaveCalculation,
            }}
          />
        </Suspense>
      );
    }

    const list = await listLeaveBalanceSummaries(year);
    return (
      <Suspense fallback={<p className="text-sm text-black/50">Loading…</p>}>
        <LeaveBalancesClient
          year={year}
          years={years}
          summaries={list.summaries}
          policy={list.policy}
          canManage={canManage}
          detail={null}
          detailError={result.error ?? list.error ?? "Employee not found."}
        />
      </Suspense>
    );
  }

  const list = await listLeaveBalanceSummaries(year);
  return (
    <Suspense fallback={<p className="text-sm text-black/50">Loading…</p>}>
      <LeaveBalancesClient
        year={year}
        years={years}
        summaries={list.summaries}
        policy={list.policy}
        canManage={canManage}
        detail={null}
        detailError={list.error}
      />
    </Suspense>
  );
}
