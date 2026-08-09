"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileText,
  FileWarning,
  Mail,
  Search,
  UserRoundX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { InsuranceCardCell } from "@/components/hr/insurance-card-cell";
import { InsuranceEmployeeEditDialog } from "@/components/hr/insurance-employee-edit-dialog";
import {
  collectPendingInsuranceUploads,
  InsurancePendingUploadsDialog,
} from "@/components/hr/insurance-pending-uploads-dialog";
import { InsuranceRequestEmailDialog } from "@/components/hr/insurance-request-email-dialog";
import { InsuranceRequestSentEmailsDialog } from "@/components/hr/insurance-request-sent-emails-dialog";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StatusBadge } from "@/components/hr/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  compareEmploymentStatusNames,
  EMPLOYMENT_STATUS_NAMES,
  isOffBoardEmploymentStatus,
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

type SortKey =
  | "employee"
  | "category"
  | "value"
  | "issue"
  | "expiry"
  | "card"
  | "status"
  | "provider";

type SortDir = "asc" | "desc";

const STATUS_SORT_ORDER: Record<InsuranceStatus, number> = {
  missing: 0,
  expired: 1,
  expiring: 2,
  valid: 3,
};

function compareNullableString(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const av = a?.trim() || "";
  const bv = b?.trim() || "";
  if (!av && bv) return 1;
  if (av && !bv) return -1;
  return av.localeCompare(bv);
}

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareNullableDate(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareDefaultWithinDepartment(
  a: InsuranceEmployeeRow,
  b: InsuranceEmployeeRow,
): number {
  const aPos = a.staff.position?.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bPos = b.staff.position?.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (aPos !== bPos) return aPos - bPos;
  const byPos = compareNullableString(
    a.staff.position?.name,
    b.staff.position?.name,
  );
  if (byPos !== 0) return byPos;
  return a.staff.full_name.localeCompare(b.staff.full_name);
}

function compareBySortKey(
  a: InsuranceEmployeeRow,
  b: InsuranceEmployeeRow,
  sortKey: SortKey,
): number {
  switch (sortKey) {
    case "employee":
      return a.staff.full_name.localeCompare(b.staff.full_name);
    case "category":
      return compareNullableString(
        a.category ?? a.suggestedCategoryName,
        b.category ?? b.suggestedCategoryName,
      );
    case "value":
      return compareNullableNumber(a.value, b.value);
    case "issue":
      return compareNullableDate(a.issueDate, b.issueDate);
    case "expiry":
      return compareNullableDate(a.expiryDate, b.expiryDate);
    case "card":
      return Number(a.hasDocument) - Number(b.hasDocument);
    case "status":
      return STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    case "provider":
      return compareNullableString(a.providerName, b.providerName);
  }
}

function SortLabel({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
  align = "start",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "start" | "center";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSort(sortKey);
      }}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-[#3D421F]",
        align === "center" && "justify-center",
        className,
      )}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      {active ? (
        sortDir === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-black/25" />
      )}
    </button>
  );
}

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
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "expiring":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "expired":
      return "border-red-200 bg-red-100 text-red-800";
    default:
      return "border-black/10 bg-black/5 text-black/55";
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
  const [sentOpen, setSentOpen] = useState(false);
  const [savedDraftCount, setSavedDraftCount] = useState(0);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [uploadedPendingKeys, setUploadedPendingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [editRow, setEditRow] = useState<InsuranceEmployeeRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    setSavedDraftCount(countInsuranceRequestDraftUnits(venueId));
  }, [venueId, emailOpen]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

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
      if (sortKey) {
        const dir = sortDir === "asc" ? 1 : -1;
        const byKey = compareBySortKey(a, b, sortKey);
        if (byKey !== 0) return byKey * dir;
        return compareDefaultWithinDepartment(a, b);
      }
      return compareDefaultWithinDepartment(a, b);
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
  }, [filtered, departments, sortKey, sortDir]);

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

  const pendingUploads = useMemo(() => {
    const all = collectPendingInsuranceUploads(rows);
    if (uploadedPendingKeys.size === 0) return all;
    return all.filter((item) => !uploadedPendingKeys.has(item.key));
  }, [rows, uploadedPendingKeys]);

  /** Badge excludes OUT / OFF Boarding; popup still lists everyone. */
  const pendingCount = useMemo(
    () =>
      pendingUploads.filter(
        (item) =>
          !isOutEmploymentStatus(item.employmentStatusName) &&
          !isOffBoardEmploymentStatus(item.employmentStatusName),
      ).length,
    [pendingUploads],
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

  const statusFilterLabels = useMemo(
    () =>
      STATUS_FILTER_OPTIONS.filter((status) => statusFilter.has(status)).map(
        statusLabel,
      ),
    [statusFilter],
  );

  function setStatusFilterFromLabels(labels: string[]) {
    const next = new Set<InsuranceStatus>();
    for (const label of labels) {
      const match = STATUS_FILTER_OPTIONS.find(
        (status) => statusLabel(status) === label,
      );
      if (match) next.add(match);
    }
    setStatusFilter(next);
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
          <MultiSelect
            className={statusControlClass}
            options={STATUS_FILTER_OPTIONS.map(statusLabel)}
            selected={statusFilterLabels}
            onChange={setStatusFilterFromLabels}
            placeholder="All coverage"
            searchPlaceholder="Search coverage…"
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
          {canManage ? (
            <button
              type="button"
              onClick={() => setPendingOpen(true)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3.5 text-sm font-medium text-[#3D421F] shadow-sm transition",
                pendingCount > 0
                  ? "border-red-200 hover:border-red-300 hover:bg-red-50/60"
                  : "border-black/10 hover:bg-black/[0.03]",
              )}
            >
              <FileWarning
                className={cn(
                  "h-4 w-4",
                  pendingCount > 0 ? "text-red-600" : "text-black/40",
                )}
                aria-hidden
              />
              <span>Cards</span>
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  pendingCount > 0
                    ? "bg-red-600 text-white"
                    : "bg-black/5 text-black/40",
                )}
                aria-label={`${pendingCount} insurance cards pending upload`}
              >
                {pendingCount}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={applyMissingAttention}
            aria-pressed={missingAttentionFilter}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-medium shadow-sm transition",
              missingAttentionFilter
                ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                : missingCount > 0
                  ? "border-amber-200 bg-white text-[#3D421F] hover:border-amber-300 hover:bg-amber-50/60"
                  : "border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.03]",
            )}
          >
            <UserRoundX
              className={cn(
                "h-4 w-4",
                missingAttentionFilter
                  ? "text-white"
                  : missingCount > 0
                    ? "text-amber-700"
                    : "text-black/40",
              )}
              aria-hidden
            />
            <span>Missing</span>
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                missingAttentionFilter
                  ? "bg-white/20 text-white"
                  : missingCount > 0
                    ? "bg-amber-600 text-white"
                    : "bg-black/5 text-black/40",
              )}
              aria-label={`${missingCount} employees missing or expiring insurance`}
            >
              {missingCount}
            </span>
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEmailDialogStep("drafts-list");
                  setEmailOpen(true);
                }}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border border-amber-300/70 bg-amber-100 px-3 text-sm font-medium text-amber-950 shadow-sm transition hover:bg-amber-200/80",
                )}
              >
                <FileText
                  className="h-4 w-4 text-amber-800"
                  aria-hidden
                />
                <span>Drafts</span>
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    savedDraftCount > 0
                      ? "bg-amber-700 text-white"
                      : "bg-amber-200/80 text-amber-800/70",
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
              <button
                type="button"
                onClick={() => setSentOpen(true)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium text-[#3D421F] shadow-sm transition",
                  "border-black/10 hover:bg-black/[0.03]",
                )}
              >
                <Mail className="h-4 w-4 text-black/40" aria-hidden />
                Sent
              </button>
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
                    <SortLabel
                      label="Employee"
                      sortKey="employee"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Category"
                      sortKey="category"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Value"
                      sortKey="value"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Issue"
                      sortKey="issue"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Expiry"
                      sortKey="expiry"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-3 py-3 text-center font-medium">
                    <SortLabel
                      label="Card"
                      sortKey="card"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      align="center"
                      className="w-full justify-center"
                    />
                  </th>
                  <th className="px-4 py-3 text-center font-medium">
                    <SortLabel
                      label="Status"
                      sortKey="status"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      align="center"
                      className="w-full justify-center"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Provider"
                      sortKey="provider"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {departmentGroups.map((group) => (
                  <Fragment key={group.id}>
                    <tr className="bg-[var(--venue-secondary,#F0F3DD)]/40">
                      <td
                        colSpan={canManage ? 9 : 8}
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
                          role={canManage ? "button" : undefined}
                          tabIndex={canManage ? 0 : undefined}
                          onClick={
                            canManage ? () => setEditRow(row) : undefined
                          }
                          onKeyDown={
                            canManage
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setEditRow(row);
                                  }
                                }
                              : undefined
                          }
                          className={cn(
                            "border-b border-black/5 last:border-0",
                            canManage &&
                              "cursor-pointer transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/40",
                            selectedIds.has(row.staff.id) &&
                              "bg-[var(--venue-primary,#818a40)]/[0.04]",
                          )}
                        >
                          {canManage ? (
                            <td
                              className="px-3 py-3 align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
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
                            <div className="flex items-stretch gap-3">
                              <StaffPhotoThumbnail
                                fullName={row.staff.full_name}
                                photoUrl={row.staff.photo_url}
                                size="fill"
                                empNo={row.staff.emp_no}
                                department={row.staff.department?.name}
                                position={row.staff.position?.name}
                                employeeStatus={
                                  row.staff.employment_status?.name
                                }
                                workingStatus={row.staff.working_status?.name}
                                nationality={row.staff.nationality?.name}
                                dob={row.staff.dob}
                                joiningDate={row.staff.joining_date}
                                terminationDate={row.staff.termination_date}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-[#3D421F]">
                                    {row.staff.full_name}
                                  </span>
                                </div>
                                <div
                                  className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-black/45"
                                  onClick={(e) => e.stopPropagation()}
                                >
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
                              </div>
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
                          <td
                            className="px-3 py-3 align-middle text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <InsuranceCardCell
                              row={row}
                              canManage={canManage}
                              onUploaded={() => router.refresh()}
                            />
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                statusClass(row.status),
                              )}
                            >
                              {statusLabel(row.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-[#3D421F]">
                            {row.providerName || "—"}
                          </td>
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

      {pendingOpen ? (
        <InsurancePendingUploadsDialog
          open={pendingOpen}
          onOpenChange={setPendingOpen}
          items={pendingUploads}
          canManage={canManage}
          onUploaded={(itemKey) => {
            setUploadedPendingKeys((prev) => new Set(prev).add(itemKey));
          }}
        />
      ) : null}

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

      <InsuranceRequestSentEmailsDialog
        open={sentOpen}
        onOpenChange={setSentOpen}
      />
    </div>
  );
}
