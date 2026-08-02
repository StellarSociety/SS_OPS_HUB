"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StaffEmploymentPathPay } from "@/components/hr/staff-employment-path-pay";
import { StaffEmploymentPathPositionSalary } from "@/components/hr/staff-employment-path-position-salary";
import {
  listStaffPositionSalaryChanges,
  type StaffPositionSalaryChangeItem,
} from "@/lib/actions/hr-staff-position-salary";
import {
  computeSalaryBreakdown,
  formatAed,
  formatDateOnly,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import type { Department, Position } from "@/lib/hr/types";
import {
  segmentedSubNavLinkClass,
  segmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

function accommodationPhrase(flag: string | null | undefined): string {
  return flag === "Yes" ? "with Company Accommodation Provided" : "";
}

export const EMPLOYMENT_PATH_SUBTABS = [
  "path",
  "position_salary",
  "disciplinary",
  "pay",
] as const;

export type EmploymentPathSubtab = (typeof EMPLOYMENT_PATH_SUBTABS)[number];

const SUBTAB_LABELS: Record<EmploymentPathSubtab, string> = {
  path: "Path",
  position_salary: "Position / Salary",
  disciplinary: "Disciplinary",
  pay: "Pay",
};

type StaffEmploymentPathProps = {
  staffId?: string | null;
  joiningDate?: string | null;
  canViewSalary?: boolean;
  canEdit?: boolean;
  departments?: Department[];
  positions?: Position[];
  currentDepartmentId?: string;
  currentPositionId?: string;
  currentWagePackage?: string;
  currentCompanyAccommodation?: string;
  salaryPct?: SalaryPercentages;
  onPositionSalaryApplied?: (patch: {
    department_id: string;
    position_id: string;
    wage_package: string;
    company_accommodation: string;
  }) => void;
  className?: string;
};

function PlaceholderPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="space-y-1">
        <h3 className="font-serif text-lg text-[#3D421F]">{title}</h3>
        <p className="text-sm leading-relaxed text-black/50">{description}</p>
      </div>
      {children}
    </Card>
  );
}

function PathOverview({
  staffId,
  joiningDate,
  canViewSalary,
  canEdit,
  salaryPct,
  onEditItem,
}: {
  staffId: string | null;
  joiningDate: string | null;
  canViewSalary: boolean;
  canEdit: boolean;
  salaryPct: SalaryPercentages;
  onEditItem?: (item: StaffPositionSalaryChangeItem) => void;
}) {
  const [items, setItems] = useState<StaffPositionSalaryChangeItem[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!staffId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const result = await listStaffPositionSalaryChanges(staffId);
      if (cancelled || !result.ok) return;
      setItems(result.items);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const recentFirst = [...items].sort((a, b) => {
    const byDate = b.effectiveDate.localeCompare(a.effectiveDate);
    if (byDate !== 0) return byDate;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <PlaceholderPanel
      title="Employment path"
      description="History of this employee — newest events first, start date at the bottom."
    >
      {!staffId ? (
        <p className="text-sm text-black/45">
          Save this employee to build their employment path.
        </p>
      ) : null}

      {staffId && pending && recentFirst.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-black/50">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading path…
        </div>
      ) : null}

      {staffId ? (
        <ul className="relative ml-1.5 space-y-3 border-l border-black/10">
          {recentFirst.map((item) => {
            const showPosition =
              item.changeKind === "position" || item.changeKind === "both";
            const showSalary =
              item.changeKind === "salary" || item.changeKind === "both";
            const toAccom = accommodationPhrase(item.toCompanyAccommodation);
            return (
            <li key={item.id} className="relative pl-6">
              <span
                className="absolute left-0 top-3 size-2.5 rounded-full border-2 border-white bg-[var(--venue-primary,#6B7B3A)] shadow-sm ring-1 ring-black/10"
                aria-hidden
              />
              <div className="rounded-lg border border-black/8 bg-white/70 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium tabular-nums text-[#3D421F]">
                    {formatDateOnly(item.effectiveDate)}
                  </p>
                  {canEdit && onEditItem ? (
                    <button
                      type="button"
                      onClick={() => onEditItem(item)}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#3D421F] transition hover:bg-[var(--venue-primary)]/10"
                    >
                      <Pencil className="h-3 w-3" aria-hidden />
                      Edit
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[#3D421F]">
                  {item.changeKind === "salary"
                    ? "Salary update"
                    : item.changeKind === "both"
                      ? "Position & salary change"
                      : "Position change"}
                  {showPosition && item.toPositionName
                    ? ` → ${item.toPositionName}`
                    : ""}
                </p>
                {canViewSalary && showSalary && item.toWagePackage != null ? (
                  <p className="mt-1 text-xs text-black/50">
                    Package{" "}
                    <span className="font-semibold tabular-nums text-[#3D421F]">
                      {formatAed(item.toWagePackage)}
                    </span>
                    {toAccom ? (
                      <>
                        {" · "}
                        <span className="font-semibold text-[#3D421F]">
                          {toAccom}
                        </span>
                      </>
                    ) : null}
                    {" · "}
                    Salary to pay{" "}
                    <span className="font-semibold tabular-nums text-[#3D421F]">
                      {formatAed(
                        computeSalaryBreakdown(
                          item.toWagePackage,
                          item.toCompanyAccommodation === "Yes",
                          salaryPct,
                        ).salaryToPay,
                      )}
                    </span>
                  </p>
                ) : null}
                {item.reason.trim() ? (
                  <p className="mt-1 text-xs text-black/45">{item.reason}</p>
                ) : null}
              </div>
            </li>
            );
          })}

          {joiningDate ? (
            <li className="relative pl-6">
              <span
                className="absolute left-0 top-3 size-2.5 rounded-full border-2 border-white bg-black/25 shadow-sm ring-1 ring-black/10"
                aria-hidden
              />
              <div className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-3">
                <p className="text-sm font-medium tabular-nums text-[#3D421F]">
                  {formatDateOnly(joiningDate)}
                </p>
                <p className="mt-1 text-sm text-black/50">Employment started</p>
              </div>
            </li>
          ) : null}

          {!pending && recentFirst.length === 0 && !joiningDate ? (
            <li className="pl-6 text-sm text-black/45">No path events yet.</li>
          ) : null}
        </ul>
      ) : null}

      <p className="text-xs text-black/40">
        Add position and salary changes under Position / Salary. Disciplinary
        actions will appear here later.
      </p>
    </PlaceholderPanel>
  );
}

export function StaffEmploymentPath({
  staffId = null,
  joiningDate = null,
  canViewSalary = false,
  canEdit = false,
  departments = [],
  positions = [],
  currentDepartmentId = "",
  currentPositionId = "",
  currentWagePackage = "",
  currentCompanyAccommodation = "No",
  salaryPct = { basic: 60, accom: 25, transp: 15 },
  onPositionSalaryApplied,
  className,
}: StaffEmploymentPathProps) {
  const [subtab, setSubtab] = useState<EmploymentPathSubtab>("path");
  const [editFromPathId, setEditFromPathId] = useState<string | null>(null);

  return (
    <div className={cn("space-y-4", className)}>
      <nav
        aria-label="Employment path sections"
        className={segmentedSubNavShellClass}
        role="tablist"
      >
        {EMPLOYMENT_PATH_SUBTABS.map((id) => {
          const active = subtab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubtab(id)}
              className={segmentedSubNavLinkClass(active)}
            >
              <span className="min-w-0 truncate">{SUBTAB_LABELS[id]}</span>
            </button>
          );
        })}
      </nav>

      {subtab === "path" ? (
        <PathOverview
          staffId={staffId}
          joiningDate={joiningDate}
          canViewSalary={canViewSalary}
          canEdit={canEdit}
          salaryPct={salaryPct}
          onEditItem={
            canEdit
              ? (item) => {
                  setEditFromPathId(item.id);
                  setSubtab("position_salary");
                }
              : undefined
          }
        />
      ) : null}

      {subtab === "position_salary" ? (
        <StaffEmploymentPathPositionSalary
          staffId={staffId}
          joiningDate={joiningDate}
          canViewSalary={canViewSalary}
          canEdit={canEdit}
          departments={departments}
          positions={positions}
          currentDepartmentId={currentDepartmentId}
          currentPositionId={currentPositionId}
          currentWagePackage={currentWagePackage}
          currentCompanyAccommodation={currentCompanyAccommodation}
          salaryPct={salaryPct}
          onApplied={onPositionSalaryApplied}
          openEditChangeId={editFromPathId}
          onOpenEditChangeIdConsumed={() => setEditFromPathId(null)}
        />
      ) : null}

      {subtab === "disciplinary" ? (
        <PlaceholderPanel
          title="Disciplinary actions"
          description="Record and review disciplinary actions in chronological order."
        >
          <p className="text-sm text-black/45">No actions recorded yet.</p>
        </PlaceholderPanel>
      ) : null}

      {subtab === "pay" ? (
        <StaffEmploymentPathPay
          staffId={staffId}
          canViewSalary={canViewSalary}
        />
      ) : null}
    </div>
  );
}
