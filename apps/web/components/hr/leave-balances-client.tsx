"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { LeaveBalancesTable } from "@/components/hr/leave-balances-table";
import { LeaveEmployeeDetail } from "@/components/hr/leave-employee-detail";
import type {
  EmployeeLeaveSummary,
  ScheduledLeaveLabelStyle,
  ScheduledLeaveRange,
} from "@/lib/hr/leave";
import type {
  HrLeaveBalance,
  HrLeaveBalanceAdjustment,
  HrLeavePolicySettings,
} from "@/lib/hr/types";
import { toScopedHref } from "@/lib/venue/scope-routing";

type DetailPayload = {
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    joining_date: string | null;
    termination_date: string | null;
    probation_status: string | null;
    photo_url: string | null;
    department: { name: string } | null;
  };
  balances: HrLeaveBalance[];
  adjustments: HrLeaveBalanceAdjustment[];
  scheduledLeaves: ScheduledLeaveRange[];
  scheduleLabels: ScheduledLeaveLabelStyle[];
  policy: HrLeavePolicySettings;
  year: number;
};

type LeaveBalancesClientProps = {
  year: number;
  years: number[];
  summaries: EmployeeLeaveSummary[];
  policy: HrLeavePolicySettings;
  canManage: boolean;
  detail: DetailPayload | null;
  detailError?: string | null;
};

export function LeaveBalancesClient({
  year,
  years,
  summaries,
  policy,
  canManage,
  detail,
  detailError,
}: LeaveBalancesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { scope, slug } = useVenueScope();

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      const href = qs
        ? `/hr/attendance/leave/balances?${qs}`
        : "/hr/attendance/leave/balances";
      router.push(toScopedHref(href, scope, slug));
    },
    [router, searchParams, scope, slug],
  );

  return (
    <div className="space-y-4">
      {!detail ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-black/55">
            <span className="font-medium text-[#3D421F]/80">Year</span>
            <select
              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-sm font-medium tabular-nums text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
              value={year}
              onChange={(e) =>
                setParams({
                  year: e.target.value,
                  staffId: searchParams.get("staffId"),
                })
              }
              aria-label="Calendar year"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {detail ? (
        <LeaveEmployeeDetail
          year={detail.year}
          policy={detail.policy}
          staff={detail.staff}
          balances={detail.balances}
          adjustments={detail.adjustments}
          scheduledLeaves={detail.scheduledLeaves}
          scheduleLabels={detail.scheduleLabels}
          canManage={canManage}
          onBack={() => setParams({ staffId: null, year: String(year) })}
        />
      ) : (
        <>
          {detailError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
              {detailError}
            </p>
          ) : null}
          <LeaveBalancesTable
            year={year}
            summaries={summaries}
            carryForwardMaxDays={policy.annual.carryForwardMaxDays}
            canManage={canManage}
            onSelectStaff={(staffId) =>
              setParams({ staffId, year: String(year) })
            }
          />
        </>
      )}
    </div>
  );
}
