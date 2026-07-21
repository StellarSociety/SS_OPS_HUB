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

  const list = await listLeaveBalanceSummaries(year);
  const years = [nowYear - 1, nowYear, nowYear + 1];

  let detail = null;
  let detailError: string | null = null;

  if (params.staffId) {
    const result = await getEmployeeLeaveBalances({
      staffId: params.staffId,
      leaveYear: year,
    });
    if (result.error || !result.staff) {
      detailError = result.error ?? "Employee not found.";
    } else {
      detail = {
        staff: result.staff,
        balances: result.balances,
        adjustments: result.adjustments,
        scheduledLeaves: result.scheduledLeaves,
        scheduleLabels: result.scheduleLabels,
        policy: result.policy,
        year: result.year,
      };
    }
  }

  return (
    <Suspense fallback={<p className="text-sm text-black/50">Loading…</p>}>
      <LeaveBalancesClient
        year={year}
        years={years}
        summaries={list.summaries}
        policy={list.policy}
        canManage={canManage}
        detail={detail}
        detailError={detailError ?? list.error}
      />
    </Suspense>
  );
}
