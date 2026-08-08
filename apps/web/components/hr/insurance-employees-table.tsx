"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  FileCheck2,
  FileText,
  Mail,
  Pencil,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { InsuranceEmployeeEditDialog } from "@/components/hr/insurance-employee-edit-dialog";
import { InsuranceRequestEmailDialog } from "@/components/hr/insurance-request-email-dialog";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StatusBadge } from "@/components/hr/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  compareEmploymentStatusNames,
  EMPLOYMENT_STATUS_NAMES,
  isOutEmploymentStatus,
  normalizeEmploymentStatusName,
} from "@/lib/hr/employment-status";
import { countInsuranceRequestDraftUnits } from "@/lib/hr/insurance-request-drafts-storage";
import type {
  Department,
  EmploymentStatus,
  InsuranceCategoryWithDefaults,
  InsuranceEmployeeRow,
  InsuranceProvider,
  InsuranceStatus,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type InsuranceEmployeesTableProps = {
  rows: InsuranceEmployeeRow[];
  categories: InsuranceCategoryWithDefaults[];
  departments: Department[];
  employmentStatuses: EmploymentStatus[];
  providers?: InsuranceProvider[];
  venueId: string;
  canManage?: boolean;
};

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

/**
 * Wider than certifications: insurance also has a category filter,
 * so search + selects need room before the "Selected only" control.
 */
const leadingBlockClass = "w-full max-w-[min(100%,56rem)]";

const filterControlClass = "min-w-0 flex-1 basis-[9rem]";
const searchControlClass = "relative min-w-0 flex-[1.35] basis-[11rem]";
const statusControlClass =
  "min-w-0 flex-1 basis-[9rem] [&_button]:h-10 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-sm";

const STATUS_FILTER_OPTIONS: InsuranceStatus[] = [
  "missing",
  "expired",
  "expiring",
  "valid",
];

function defaultEmploymentStatusFilter(
  statuses: EmploymentStatus[],
): string[] {
  const wanted = new Set<string>([
    EMPLOYMENT_STATUS_NAMES.onBoard,
    EMPLOYMENT_STATUS_NAMES.offBoard,
  ]);
  return statuses
    .filter((s) => wanted.has(normalizeEmploymentStatusName(s.name)))
    .sort((a, b) => compareEmploymentStatusNames(a.name, b.name))
    .map((s) => s.name);
}

function statusLabel(status: InsuranceStatus): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "expiring":
      return "Expiring";
    case "expired":
      return "Expired";
    default:
      return "Missing";
  }
}

function statusClass(status: InsuranceStatus): string {
  switch (status) {
    case "valid":
      return "text-emerald-800";
    case "expiring":
      return "text-amber-800";
    case "expired":
      return "text-red-700";
    default:
      return "text-black/45";
  }
}

function isIncludedInMissingAction(
  employmentStatusName: string | null | undefined,
): boolean {
  const name = normalizeEmploymentStatusName(employmentStatusName);
  return (
    name === EMPLOYMENT_STATUS_NAMES.hiring ||
    name === EMPLOYMENT_STATUS_NAMES.onBoard
  );
}

function employmentStatusesForMissingAction(
  statuses: EmploymentStatus[],
): string[] {
  return statuses
    .filter((s) => isIncludedInMissingAction(s.name))
    .sort((a, b) => compareEmploymentStatusNames(a.name, b.name))
    .map((s) => s.name);
}

export function InsuranceEmployeesTable({
  rows,
  categories,
  departments,
  employmentStatuses,
  providers = [],
  venueId,
  canManage = false,
}: InsuranceEmployeesTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<
    string[]
  >(() => defaultEmploymentStatusFilter(employmentStatuses));
  const [statusFilter, setStatusFilter] = useState<Set<InsuranceStatus>>(
    () => new Set(),
  );
  const [missingAttentionFilter, setMissingAttentionFilter] = useState(false);
  const [hideUnselected, setHideUnselected] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDialogStep, setEmailDialogStep] = useState<
    "compose" | "drafts-list"
  >("compose");
  const [savedDraftCount, setSavedDraftCount] = useState(0);
  const [editRow, setEditRow] = useState<InsuranceEmployeeRow | null>(null);

  useEffect(() => {
    setSavedDraftCount(countInsuranceRequestDraftUnits(venueId));
  }, [venueId, emailOpen]);

  function refreshDraftCount() {
    setSavedDraftCount(countInsuranceRequestDraftUnits(venueId));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (departmentFilter && row.staff.department_id !== departmentFilter) {
        return false;
      }
      if (categoryFilter) {
        const cat = (row.category ?? "").toLowerCase();
        if (cat !== categoryFilter.toLowerCase()) return false;
      }
      if (employmentStatusFilter.length > 0) {
        const selected = new Set(
          employmentStatusFilter.map((n) => normalizeEmploymentStatusName(n)),
        );
        const statusName = normalizeEmploymentStatusName(
          row.staff.employment_status?.name,
        );
        if (!selected.has(statusName)) return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(row.status)) {
        return false;
      }
      if (
        missingAttentionFilter &&
        !(row.status === "missing" || row.status === "expiring")
      ) {
        return false;
      }
      if (hideUnselected && !selectedIds.has(row.staff.id)) {
        return false;
      }
      if (!q) return true;
      return (
        row.staff.full_name.toLowerCase().includes(q) ||
        row.staff.emp_no.toLowerCase().includes(q) ||
        (row.staff.department?.name.toLowerCase().includes(q) ?? false) ||
        (row.staff.position?.name.toLowerCase().includes(q) ?? false) ||
        (row.category?.toLowerCase().includes(q) ?? false) ||
        (row.providerName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    rows,
    search,
    departmentFilter,
    categoryFilter,
    employmentStatusFilter,
    statusFilter,
    missingAttentionFilter,
    hideUnselected,
    selectedIds,
  ]);

  const departmentGroups = useMemo(() => {
    const deptOrder = new Map(
      departments.map((d, index) => [d.id, d.sort_order ?? index]),
    );
    const byDept = new Map<
      string,
      { id: string; name: string; rows: InsuranceEmployeeRow[] }
    >();

    for (const row of filtered) {
      const id = row.staff.department_id ?? "__none__";
      const name = row.staff.department?.name?.trim() || "No department";
      const existing = byDept.get(id);
      if (existing) {
        existing.rows.push(row);
      } else {
        byDept.set(id, { id, name, rows: [row] });
      }
    }

    function compareWithinDepartment(
      a: InsuranceEmployeeRow,
      b: InsuranceEmployeeRow,
    ): number {
      const aPos = a.staff.position?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bPos = b.staff.position?.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      const aPosName = a.staff.position?.name?.trim() ?? "";
      const bPosName = b.staff.position?.name?.trim() ?? "";
      if (!aPosName && bPosName) return 1;
      if (aPosName && !bPosName) return -1;
      const byPos = aPosName.localeCompare(bPosName);
      if (byPos !== 0) return byPos;
      return a.staff.full_name.localeCompare(b.staff.full_name);
    }

    return [...byDept.values()]
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort(compareWithinDepartment),
      }))
      .sort((a, b) => {
        if (a.id === "__none__") return 1;
        if (b.id === "__none__") return -1;
        const ao = deptOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bo = deptOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });
  }, [filtered, departments]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.staff.id));

  function toggleAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const row of filtered) next.delete(row.staff.id);
      } else {
        for (const row of filtered) next.add(row.staff.id);
      }
      return next;
    });
  }

  function toggleOne(staffId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.staff.id)),
    [rows, selectedIds],
  );

  const missingAttentionTargets = useMemo(
    () =>
      rows.filter(
        (row) =>
          isIncludedInMissingAction(row.staff.employment_status?.name) &&
          (row.status === "missing" || row.status === "expiring") &&
          !isOutEmploymentStatus(row.staff.employment_status?.name),
      ),
    [rows],
  );

  const missingCount = missingAttentionTargets.length;
  const coveredCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === "valid" ||
          r.status === "expiring" ||
          r.status === "expired",
      ).length,
    [rows],
  );

  function applyMissingAttention() {
    if (missingAttentionFilter) {
      setMissingAttentionFilter(false);
      setSelectedIds(new Set());
      setEmploymentStatusFilter(
        defaultEmploymentStatusFilter(employmentStatuses),
      );
      setStatusFilter(new Set());
      return;
    }

    setSearch("");
    setDepartmentFilter("");
    setCategoryFilter("");
    setStatusFilter(new Set(["missing", "expiring"]));
    setEmploymentStatusFilter(
      employmentStatusesForMissingAction(employmentStatuses),
    );
    setMissingAttentionFilter(true);
    setSelectedIds(
      new Set(missingAttentionTargets.map((row) => row.staff.id)),
    );
  }

  function toggleStatusChip(status: InsuranceStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const c of categories) names.add(c.name);
    for (const row of rows) {
      if (row.category) names.add(row.category);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories, rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center",
            leadingBlockClass,
          )}
        >
          <div className={searchControlClass}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="pl-9"
            />
          </div>
          <select
            className={cn(selectClass, filterControlClass)}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className={cn(selectClass, filterControlClass)}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by insurance category"
          >
            <option value="">All categories</option>
            {categoryNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <MultiSelect
            className={statusControlClass}
            options={[...employmentStatuses]
              .sort((a, b) => compareEmploymentStatusNames(a.name, b.name))
              .map((s) => s.name)}
            selected={employmentStatusFilter}
            onChange={setEmploymentStatusFilter}
            placeholder="All statuses"
            searchPlaceholder="Search statuses…"
          />
          {canManage ? (
            <label
              className={cn(
                "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm text-[#3D421F] transition",
                hideUnselected
                  ? "border-[var(--venue-primary,#818a40)]/50"
                  : "border-black/10 hover:bg-black/[0.02]",
                selectedIds.size === 0 && "opacity-60",
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-black/20"
                checked={hideUnselected}
                onChange={(e) => setHideUnselected(e.target.checked)}
                disabled={selectedIds.size === 0 && !hideUnselected}
              />
              <span className="whitespace-nowrap">Selected only</span>
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTER_OPTIONS.map((status) => {
              const active = statusFilter.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleStatusChip(status)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition",
                    active
                      ? "bg-[var(--venue-primary,#818a40)] text-white"
                      : "bg-black/[0.04] text-black/45 hover:bg-black/[0.08] hover:text-[#3D421F]",
                  )}
                >
                  {statusLabel(status)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={applyMissingAttention}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition",
              missingAttentionFilter
                ? "border-amber-500/40 bg-amber-50 text-amber-900"
                : "border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.02]",
            )}
          >
            Missing {missingCount}
          </button>
          <span className="text-xs text-black/40">
            Covered {coveredCount}
          </span>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEmailDialogStep("drafts-list");
                  setEmailOpen(true);
                }}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium text-[#3D421F] shadow-sm transition",
                  savedDraftCount > 0
                    ? "border-black/15 hover:bg-black/[0.03]"
                    : "border-black/10 hover:bg-black/[0.03]",
                )}
              >
                <FileText
                  className={cn(
                    "h-4 w-4",
                    savedDraftCount > 0 ? "text-[#3D421F]" : "text-black/40",
                  )}
                  aria-hidden
                />
                <span>Drafts</span>
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    savedDraftCount > 0
                      ? "bg-[var(--venue-primary,#818a40)] text-white"
                      : "bg-black/5 text-black/40",
                  )}
                  aria-label={`${savedDraftCount} saved insurance draft emails`}
                >
                  {savedDraftCount}
                </span>
              </button>
              <Button
                type="button"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  setEmailDialogStep("compose");
                  setEmailOpen(true);
                }}
              >
                <Mail className="h-4 w-4" />
                Email request
                {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <p className="text-center text-sm text-muted-foreground">
            No employees match your filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
                <tr>
                  {canManage ? (
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-black/20"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        aria-label="Select all filtered employees"
                      />
                    </th>
                  ) : null}
                  <th className="min-w-[16rem] px-4 py-3 font-medium">
                    Employee
                  </th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  {canManage ? (
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {departmentGroups.map((group) => (
                  <Fragment key={group.id}>
                    <tr className="bg-[var(--venue-secondary,#F0F3DD)]/40">
                      <td
                        colSpan={canManage ? 9 : 7}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#3D421F]"
                      >
                        {group.name}
                        <span className="ml-2 font-normal text-black/40">
                          {group.rows.length}
                        </span>
                      </td>
                    </tr>
                    {group.rows.map((row) => {
                      const alert =
                        row.status === "expired" || row.status === "missing";
                      return (
                        <tr
                          key={row.staff.id}
                          className={cn(
                            "border-b border-black/5 last:border-0",
                            selectedIds.has(row.staff.id) && "bg-[var(--venue-primary,#818a40)]/[0.04]",
                          )}
                        >
                          {canManage ? (
                            <td className="px-3 py-3 align-middle">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-black/20"
                                checked={selectedIds.has(row.staff.id)}
                                onChange={() => toggleOne(row.staff.id)}
                                aria-label={`Select ${row.staff.full_name}`}
                              />
                            </td>
                          ) : null}
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[#3D421F]">
                                {row.staff.full_name}
                              </span>
                              {row.hasDocument ? (
                                <FileCheck2
                                  className="h-3.5 w-3.5 shrink-0 text-emerald-700"
                                  aria-label="Insurance document uploaded"
                                />
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-black/45">
                              <StaffDirectoryLink
                                staffId={row.staff.id}
                                empNo={row.staff.emp_no}
                              />
                              {row.staff.position?.name
                                ? ` · ${row.staff.position.name}`
                                : null}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              <StatusBadge
                                status={row.staff.employment_status?.name}
                              />
                              {row.staff.visa_status ? (
                                <StatusBadge status={row.staff.visa_status} />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-[#3D421F]">
                            {row.category || (
                              <span className="text-black/35">
                                {row.suggestedCategoryName
                                  ? `Suggested: ${row.suggestedCategoryName}`
                                  : "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-[#3D421F]">
                            {row.value != null ? formatAed(row.value) : "—"}
                          </td>
                          <td className="px-4 py-3 align-middle text-[#3D421F]">
                            {row.issueDate
                              ? formatDateOnly(row.issueDate)
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 align-middle",
                              alert ? "text-red-700" : "text-[#3D421F]",
                            )}
                          >
                            {row.expiryDate
                              ? formatDateOnly(row.expiryDate)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span
                              className={cn(
                                "text-xs font-medium",
                                statusClass(row.status),
                              )}
                            >
                              {statusLabel(row.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-[#3D421F]">
                            {row.providerName || "—"}
                          </td>
                          {canManage ? (
                            <td className="px-4 py-3 align-middle">
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditRow(row)}
                                  aria-label={`Edit insurance for ${row.staff.full_name}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InsuranceEmployeeEditDialog
        row={editRow}
        categories={categories}
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
        onSaved={() => router.refresh()}
      />

      <InsuranceRequestEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        rows={selectedRows}
        providers={providers}
        venueId={venueId}
        initialStep={emailDialogStep}
        onDraftsChanged={refreshDraftCount}
        onSent={() => {
          setSelectedIds(new Set());
          refreshDraftCount();
          router.refresh();
        }}
      />
    </div>
  );
}
