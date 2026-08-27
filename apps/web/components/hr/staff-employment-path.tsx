"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StaffEmploymentPathPay } from "@/components/hr/staff-employment-path-pay";
import {
  EmploymentStartedMarker,
  resolveStartingEmployment,
  StaffEmploymentPathPositionSalary,
} from "@/components/hr/staff-employment-path-position-salary";
import {
  listStaffPositionSalaryChanges,
  type StaffPositionSalaryChangeItem,
} from "@/lib/actions/hr-staff-position-salary";
import {
  getStaffEmploymentPathLifecycle,
  type StaffEmploymentPathLifecycle,
} from "@/lib/actions/hr-offboarding";
import {
  computeSalaryBreakdown,
  formatAed,
  formatDateOnly,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import {
  STAFF_TERMINATION_TYPE_OPTIONS,
  type Department,
  type Position,
} from "@/lib/hr/types";
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

const changesInFlight = new Map<
  string,
  ReturnType<typeof listStaffPositionSalaryChanges>
>();

function loadPositionSalaryChanges(staffId: string) {
  const existing = changesInFlight.get(staffId);
  if (existing) return existing;
  const request = listStaffPositionSalaryChanges(staffId).finally(() => {
    changesInFlight.delete(staffId);
  });
  changesInFlight.set(staffId, request);
  return request;
}

type StaffEmploymentPathProps = {
  staffId?: string | null;
  joiningDate?: string | null;
  terminationDate?: string | null;
  terminationType?: string | null;
  canViewSalary?: boolean;
  canEdit?: boolean;
  departments?: Department[];
  positions?: Position[];
  currentDepartmentId?: string;
  currentPositionId?: string;
  currentWagePackage?: string;
  currentCompanyAccommodation?: string;
  currentVisaStatus?: string;
  currentVisaExpiry?: string;
  salaryPct?: SalaryPercentages;
  onPositionSalaryApplied?: (patch: {
    department_id: string;
    position_id: string;
    wage_package: string;
    company_accommodation: string;
    visa_status?: string;
    visa_expiry?: string;
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

function exitKindLabel(kind: string | null | undefined): string {
  if (kind === "resignation") return "Resignation";
  if (kind === "termination_with_notice") return "Termination with notice";
  if (kind === "immediate_termination" || kind === "termination") {
    return "Immediate termination";
  }
  const match = STAFF_TERMINATION_TYPE_OPTIONS.find((opt) => opt.value === kind);
  return match?.label ?? "Employment ended";
}

function exitNodeClass(kind: string | null | undefined): string {
  return kind === "resignation"
    ? "bg-amber-500"
    : "bg-red-600";
}

type PathLifecycleEvent = {
  id: string;
  date: string;
  createdAt: string;
  title: string;
  subtitle?: string;
  nodeClass: string;
  change?: StaffPositionSalaryChangeItem;
};

function lifecycleEventsFrom(
  lifecycle: StaffEmploymentPathLifecycle | null,
  terminationDate: string | null,
  terminationType: string | null,
  changes: StaffPositionSalaryChangeItem[],
): PathLifecycleEvent[] {
  const events: PathLifecycleEvent[] = changes.map((item) => ({
    id: item.id,
    date: item.effectiveDate,
    createdAt: item.createdAt,
    title: "",
    nodeClass: "bg-[var(--venue-primary,#6B7B3A)]",
    change: item,
  }));

  const offboarding = lifecycle?.offboarding;
  if (offboarding) {
    if (offboarding.notificationDate) {
      events.push({
        id: `ob-notice-${offboarding.notificationDate}`,
        date: offboarding.notificationDate,
        createdAt: `${offboarding.notificationDate}T12:00:00.000Z`,
        title: exitKindLabel(offboarding.kind),
        subtitle:
          offboarding.kind === "resignation"
            ? "Resignation notified"
            : "Termination notification given",
        nodeClass: exitNodeClass(offboarding.kind),
      });
    }
    if (offboarding.lastWorkingDay) {
      events.push({
        id: `ob-lwd-${offboarding.lastWorkingDay}`,
        date: offboarding.lastWorkingDay,
        createdAt: `${offboarding.lastWorkingDay}T18:00:00.000Z`,
        title: "Last working day",
        subtitle: exitKindLabel(offboarding.kind),
        nodeClass: "bg-red-600",
      });
    }
  } else if (terminationDate) {
    events.push({
      id: `term-${terminationDate}`,
      date: terminationDate,
      createdAt: `${terminationDate}T18:00:00.000Z`,
      title: exitKindLabel(terminationType),
      subtitle: "Employment ended",
      nodeClass: exitNodeClass(terminationType),
    });
  }

  const visaCancelDate = lifecycle?.visaCancelDate ?? null;
  if (visaCancelDate) {
    events.push({
      id: `visa-cancel-${visaCancelDate}`,
      date: visaCancelDate,
      createdAt: `${visaCancelDate}T20:00:00.000Z`,
      title: "Visa canceled",
      subtitle: "Visa cancelation",
      nodeClass: "bg-red-600",
    });
  }

  return events.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function PathOverview({
  staffId,
  joiningDate,
  terminationDate,
  terminationType,
  canViewSalary,
  canEdit,
  salaryPct,
  items,
  lifecycle,
  loading,
  departments,
  positions,
  currentDepartmentId,
  currentPositionId,
  currentWagePackage,
  currentCompanyAccommodation,
  onEditItem,
}: {
  staffId: string | null;
  joiningDate: string | null;
  terminationDate: string | null;
  terminationType: string | null;
  canViewSalary: boolean;
  canEdit: boolean;
  salaryPct: SalaryPercentages;
  items: StaffPositionSalaryChangeItem[];
  lifecycle: StaffEmploymentPathLifecycle | null;
  loading: boolean;
  departments: Department[];
  positions: Position[];
  currentDepartmentId: string;
  currentPositionId: string;
  currentWagePackage: string;
  currentCompanyAccommodation: string;
  onEditItem?: (item: StaffPositionSalaryChangeItem) => void;
}) {
  const pending = loading;
  const startingEmployment = resolveStartingEmployment({
    items,
    positions,
    departments,
    currentPositionId,
    currentDepartmentId,
    currentWagePackage,
    currentCompanyAccommodation,
  });

  const recentFirst = lifecycleEventsFrom(
    lifecycle,
    terminationDate,
    terminationType,
    items,
  );

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

      {staffId && pending && recentFirst.length === 0 && !joiningDate ? (
        <div className="flex items-center gap-2 py-6 text-sm text-black/50">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading path…
        </div>
      ) : null}

      {staffId ? (
        <ul className="relative ml-1.5 space-y-3 border-l border-black/10">
          {recentFirst.map((event) => {
            const item = event.change;
            if (item) {
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
                      {item.changeKind === "visa"
                        ? "Visa update"
                        : item.changeKind === "salary"
                          ? "Salary update"
                          : item.changeKind === "both"
                            ? "Position & salary change"
                            : "Position change"}
                      {item.changeVisa && item.changeKind !== "visa"
                        ? " · Visa"
                        : ""}
                      {showPosition && item.toPositionName
                        ? ` → ${item.toPositionName}`
                        : ""}
                    </p>
                    {item.changeVisa ? (
                      <p className="mt-1 text-xs text-black/50">
                        Visa{" "}
                        <span className="font-semibold text-[#3D421F]">
                          {item.toVisaStatus || "—"}
                        </span>
                        {item.toVisaExpiry
                          ? ` · ${formatDateOnly(item.toVisaExpiry)}`
                          : ""}
                      </p>
                    ) : null}
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
            }

            return (
              <li key={event.id} className="relative pl-6">
                <span
                  className={cn(
                    "absolute left-0 top-3 size-2.5 rounded-full border-2 border-white shadow-sm ring-1 ring-black/10",
                    event.nodeClass,
                  )}
                  aria-hidden
                />
                <div className="rounded-lg border border-black/8 bg-white/70 px-3 py-3">
                  <p className="text-sm font-medium tabular-nums text-[#3D421F]">
                    {formatDateOnly(event.date)}
                  </p>
                  <p className="mt-1 text-sm text-[#3D421F]">{event.title}</p>
                  {event.subtitle ? (
                    <p className="mt-1 text-xs text-black/50">{event.subtitle}</p>
                  ) : null}
                </div>
              </li>
            );
          })}

          {joiningDate ? (
            <EmploymentStartedMarker
              joiningDate={joiningDate}
              start={startingEmployment}
              canViewSalary={canViewSalary}
              salaryPct={salaryPct}
            />
          ) : null}

          {!pending && recentFirst.length === 0 && !joiningDate ? (
            <li className="pl-6 text-sm text-black/45">No path events yet.</li>
          ) : null}
        </ul>
      ) : null}

      <p className="text-xs text-black/40">
        Resignation, termination, and visa cancelation come from Off-boarding
        and Visa. Add position and salary changes under Position / Salary.
      </p>
    </PlaceholderPanel>
  );
}

export function StaffEmploymentPath({
  staffId = null,
  joiningDate = null,
  terminationDate = null,
  terminationType = null,
  canViewSalary = false,
  canEdit = false,
  departments = [],
  positions = [],
  currentDepartmentId = "",
  currentPositionId = "",
  currentWagePackage = "",
  currentCompanyAccommodation = "No",
  currentVisaStatus = "",
  currentVisaExpiry = "",
  salaryPct = { basic: 60, accom: 25, transp: 15 },
  onPositionSalaryApplied,
  className,
}: StaffEmploymentPathProps) {
  const [subtab, setSubtab] = useState<EmploymentPathSubtab>("path");
  const [editFromPathId, setEditFromPathId] = useState<string | null>(null);
  const [items, setItems] = useState<StaffPositionSalaryChangeItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(Boolean(staffId));
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] =
    useState<StaffEmploymentPathLifecycle | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!staffId) {
      setItems([]);
      setItemsError(null);
      setItemsLoading(false);
      setLifecycle(null);
      setLifecycleLoading(false);
      return;
    }

    let cancelled = false;
    setItemsLoading(true);
    setItemsError(null);

    // Kick off the history list first. Next.js serializes server actions, so
    // the Position / Salary tab must not wait behind visa/offboarding lookups.
    void loadPositionSalaryChanges(staffId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setItems([]);
          setItemsError(result.error);
          return;
        }
        setItems(result.items);
        setItemsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setItemsError(
          err instanceof Error ? err.message : "Could not load history.",
        );
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [staffId, reloadToken]);

  useEffect(() => {
    if (!staffId || subtab !== "path" || itemsLoading) {
      if (subtab !== "path") setLifecycleLoading(false);
      return;
    }
    let cancelled = false;
    setLifecycleLoading(true);
    void getStaffEmploymentPathLifecycle(staffId)
      .then((extras) => {
        if (cancelled) return;
        setLifecycle(extras.ok ? extras.lifecycle : null);
      })
      .catch(() => {
        if (cancelled) return;
        setLifecycle(null);
      })
      .finally(() => {
        if (!cancelled) setLifecycleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId, subtab, itemsLoading]);

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
          terminationDate={terminationDate}
          terminationType={terminationType}
          canViewSalary={canViewSalary}
          canEdit={canEdit}
          salaryPct={salaryPct}
          items={items}
          lifecycle={lifecycle}
          loading={itemsLoading || lifecycleLoading}
          departments={departments}
          positions={positions}
          currentDepartmentId={currentDepartmentId}
          currentPositionId={currentPositionId}
          currentWagePackage={currentWagePackage}
          currentCompanyAccommodation={currentCompanyAccommodation}
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
          currentVisaStatus={currentVisaStatus}
          currentVisaExpiry={currentVisaExpiry}
          salaryPct={salaryPct}
          items={items}
          loading={itemsLoading}
          error={itemsError}
          onRetry={() => {
            if (staffId) changesInFlight.delete(staffId);
            setReloadToken((n) => n + 1);
          }}
          onItemsChange={setItems}
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
