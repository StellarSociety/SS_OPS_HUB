"use client";

import { VisaCancelationDialog } from "@/components/hr/visa-cancelation-dialog";
import { VisaEmployeeEditDialog } from "@/components/hr/visa-employee-edit-dialog";
import { VisaEmployeesExportDialog } from "@/components/hr/visa-employees-export-dialog";
import { VisaIssueDialog } from "@/components/hr/visa-issue-dialog";
import { VisaPenaltyDeductionsDialog } from "@/components/hr/visa-penalty-deductions-dialog";
import {
  collectPendingVisaUploads,
  VisaPendingUploadsDialog,
} from "@/components/hr/visa-pending-uploads-dialog";
import { VisaRequestEmailDialog } from "@/components/hr/visa-request-email-dialog";
import { VisaRequestSentEmailsDialog } from "@/components/hr/visa-request-sent-emails-dialog";
import { VisaResidencyFileCell, VisaNocFileCell, canShowVisaCancelationAction, canShowVisaIssueAction } from "@/components/hr/visa-residency-file-cell";
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
import { countVisaRequestDraftUnits } from "@/lib/hr/visa-request-drafts-storage";
import type {
  Department,
  EmploymentStatus,
  VisaComplianceStatus,
  VisaEmployeeRow,
  VisaProProvider,
  WorkingStatus,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Check,
  Download,
  FileText,
  FileWarning,
  Mail,
  Search,
  UserRoundX,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type VisaEmployeesTableProps = {
  rows: VisaEmployeeRow[];
  departments: Department[];
  employmentStatuses: EmploymentStatus[];
  workingStatuses?: WorkingStatus[];
  providers?: VisaProProvider[];
  venueId: string;
  canManage?: boolean;
  venueName: string;
  venueAddress?: string | null;
  venueLogoUrl?: string | null;
  userDisplayName: string;
};

type SortKey =
  | "employee"
  | "visaStatus"
  | "visaNumber"
  | "issue"
  | "expiry"
  | "cancel"
  | "penaltiesCompany"
  | "penaltiesEmployee";

type SortDir = "asc" | "desc";

const MISSING_ATTENTION_STATUSES: VisaComplianceStatus[] = [
  "missing",
  "expiring",
  "expired",
  "pending",
  "dispute",
];

const STATUS_FILTER_OPTIONS: VisaComplianceStatus[] = [
  "missing",
  "expiring",
  "expired",
  "pending",
  "dispute",
  "canceled",
  "valid",
];

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
  a: VisaEmployeeRow,
  b: VisaEmployeeRow,
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
  a: VisaEmployeeRow,
  b: VisaEmployeeRow,
  sortKey: SortKey,
): number {
  switch (sortKey) {
    case "employee":
      return a.staff.full_name.localeCompare(b.staff.full_name);
    case "visaStatus":
      return compareNullableString(
        a.visaStatus ?? a.staff.visa_status,
        b.visaStatus ?? b.staff.visa_status,
      );
    case "visaNumber":
      return compareNullableString(a.visaNumber, b.visaNumber);
    case "issue":
      return compareNullableDate(a.issueDate, b.issueDate);
    case "expiry":
      return compareNullableDate(a.expiryDate, b.expiryDate);
    case "cancel":
      return compareNullableDate(a.cancelDate, b.cancelDate);
    case "penaltiesCompany":
      return a.penaltiesCompanyAbsorbed - b.penaltiesCompanyAbsorbed;
    case "penaltiesEmployee":
      return a.penaltiesEmployeeAbsorbed - b.penaltiesEmployeeAbsorbed;
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

const leadingBlockClass = "w-full max-w-[min(100%,48rem)]";
const filterControlClass = "min-w-0 flex-1 basis-[9rem]";
const searchControlClass = "relative min-w-0 flex-[1.35] basis-[11rem]";
const statusControlClass =
  "min-w-0 flex-1 basis-[9rem] [&_button]:h-10 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-sm";

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

function statusLabel(status: VisaComplianceStatus): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "expiring":
      return "Expiring";
    case "expired":
      return "Expired";
    case "pending":
      return "Pending";
    case "dispute":
      return "Dispute";
    case "canceled":
      return "Canceled";
    default:
      return "Missing";
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

function isMissingAttentionStatus(status: VisaComplianceStatus): boolean {
  return MISSING_ATTENTION_STATUSES.includes(status);
}

export function VisaEmployeesTable({
  rows,
  departments,
  employmentStatuses,
  workingStatuses = [],
  providers = [],
  venueId,
  canManage = false,
  venueName,
  venueAddress = null,
  venueLogoUrl = null,
  userDisplayName,
}: VisaEmployeesTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<
    string[]
  >(() => defaultEmploymentStatusFilter(employmentStatuses));
  const [statusFilter, setStatusFilter] = useState<Set<VisaComplianceStatus>>(
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
  const [exportOpen, setExportOpen] = useState(false);
  const [savedDraftCount, setSavedDraftCount] = useState(0);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [uploadedPendingKeys, setUploadedPendingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [uploadedNocKeys, setUploadedNocKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [editRow, setEditRow] = useState<VisaEmployeeRow | null>(null);
  const [cancelationRow, setCancelationRow] = useState<VisaEmployeeRow | null>(
    null,
  );
  const [issueRow, setIssueRow] = useState<VisaEmployeeRow | null>(null);
  const [penaltyDeductionsRow, setPenaltyDeductionsRow] =
    useState<VisaEmployeeRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    setSavedDraftCount(countVisaRequestDraftUnits(venueId));
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
    setSavedDraftCount(countVisaRequestDraftUnits(venueId));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (departmentFilter && row.staff.department_id !== departmentFilter) {
        return false;
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
      if (missingAttentionFilter && !isMissingAttentionStatus(row.status)) {
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
        (row.visaNumber?.toLowerCase().includes(q) ?? false) ||
        (row.visaStatus?.toLowerCase().includes(q) ?? false) ||
        (row.providerName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    rows,
    search,
    departmentFilter,
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
      { id: string; name: string; rows: VisaEmployeeRow[] }
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
      a: VisaEmployeeRow,
      b: VisaEmployeeRow,
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

  const visibleRows = useMemo(
    () => departmentGroups.flatMap((group) => group.rows),
    [departmentGroups],
  );

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
          isMissingAttentionStatus(row.status) &&
          !isOutEmploymentStatus(row.staff.employment_status?.name),
      ),
    [rows],
  );

  const missingCount = missingAttentionTargets.length;

  const pendingUploads = useMemo(() => {
    const all = collectPendingVisaUploads(rows);
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
    setStatusFilter(new Set(MISSING_ATTENTION_STATUSES));
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
    const next = new Set<VisaComplianceStatus>();
    for (const label of labels) {
      const match = STATUS_FILTER_OPTIONS.find(
        (status) => statusLabel(status) === label,
      );
      if (match) next.add(match);
    }
    setStatusFilter(next);
  }

  const colSpan = canManage ? 11 : 9;

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
            placeholder="All compliance"
            searchPlaceholder="Search compliance…"
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
              <span>Residency</span>
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  pendingCount > 0
                    ? "bg-red-600 text-white"
                    : "bg-black/5 text-black/40",
                )}
                aria-label={`${pendingCount} residency cards pending upload`}
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
              aria-label={`${missingCount} employees needing visa attention`}
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
                <FileText className="h-4 w-4 text-amber-800" aria-hidden />
                <span>Drafts</span>
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    savedDraftCount > 0
                      ? "bg-amber-700 text-white"
                      : "bg-amber-200/80 text-amber-800/70",
                  )}
                  aria-label={`${savedDraftCount} saved visa draft emails`}
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
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            disabled={visibleRows.length === 0}
            onClick={() => setExportOpen(true)}
          >
            <Download className="h-4 w-4" />
            PDF export
          </Button>
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
                  <th className="px-3 py-3 text-center font-medium">
                    <span className="sr-only">Residency file</span>
                    Card
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Visa status"
                      sortKey="visaStatus"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-3 py-3 text-center font-medium">
                    <span className="sr-only">Visa NOC file</span>
                    NOC
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Visa number"
                      sortKey="visaNumber"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Issue date"
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
                  <th className="px-4 py-3 font-medium">
                    <SortLabel
                      label="Cancel"
                      sortKey="cancel"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="min-w-[11rem] px-3 py-2 font-medium">
                    <div className="space-y-1">
                      <span className="block text-center">Visa penalties</span>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-medium normal-case tracking-normal text-black/45">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-0.5 hover:text-[#3D421F]"
                          onClick={() => toggleSort("penaltiesCompany")}
                        >
                          Company
                          {sortKey === "penaltiesCompany" ? (
                            sortDir === "asc" ? (
                              <ChevronUp className="h-3 w-3" aria-hidden />
                            ) : (
                              <ChevronDown className="h-3 w-3" aria-hidden />
                            )
                          ) : (
                            <ChevronsUpDown
                              className="h-3 w-3 opacity-40"
                              aria-hidden
                            />
                          )}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-0.5 hover:text-[#3D421F]"
                          onClick={() => toggleSort("penaltiesEmployee")}
                        >
                          Employee
                          {sortKey === "penaltiesEmployee" ? (
                            sortDir === "asc" ? (
                              <ChevronUp className="h-3 w-3" aria-hidden />
                            ) : (
                              <ChevronDown className="h-3 w-3" aria-hidden />
                            )
                          ) : (
                            <ChevronsUpDown
                              className="h-3 w-3 opacity-40"
                              aria-hidden
                            />
                          )}
                        </button>
                      </div>
                    </div>
                  </th>
                  {canManage ? (
                    <th className="bg-black/[0.06] px-3 py-3 text-center font-medium">
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {departmentGroups.map((group) => (
                  <Fragment key={group.id}>
                    <tr className="bg-[var(--venue-secondary,#F0F3DD)]/40">
                      <td
                        colSpan={colSpan}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#3D421F]"
                      >
                        {group.name}
                        <span className="ml-2 font-normal text-black/40">
                          {group.rows.length}
                        </span>
                      </td>
                    </tr>
                    {group.rows.map((row) => {
                      const canceled = row.isCanceled || Boolean(row.cancelDate);
                      const expiryAlert =
                        row.status === "expired" ||
                        row.status === "expiring" ||
                        row.status === "missing" ||
                        row.status === "dispute";
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
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <VisaResidencyFileCell
                              row={
                                uploadedPendingKeys.has(row.staff.id)
                                  ? { ...row, hasResidenceDocument: true }
                                  : row
                              }
                              canManage={canManage}
                              onUploaded={() => {
                                setUploadedPendingKeys((prev) =>
                                  new Set(prev).add(row.staff.id),
                                );
                                router.refresh();
                              }}
                            />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <StatusBadge
                              status={
                                row.visaStatus || row.staff.visa_status || null
                              }
                            />
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <VisaNocFileCell
                              row={
                                uploadedNocKeys.has(row.staff.id)
                                  ? { ...row, hasNocDocument: true }
                                  : row
                              }
                              canManage={canManage}
                              onUploaded={() => {
                                setUploadedNocKeys((prev) =>
                                  new Set(prev).add(row.staff.id),
                                );
                                router.refresh();
                              }}
                            />
                          </td>
                          <td className="px-4 py-3 align-middle text-[#3D421F]">
                            {row.visaNumber || "—"}
                          </td>
                          <td className="px-4 py-3 align-middle text-[#3D421F]">
                            {row.issueDate
                              ? formatDateOnly(row.issueDate)
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 align-middle",
                              expiryAlert
                                ? "text-amber-800"
                                : "text-[#3D421F]",
                            )}
                          >
                            {row.expiryDate
                              ? formatDateOnly(row.expiryDate)
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 align-middle",
                              canceled
                                ? "font-medium text-red-700"
                                : "text-[#3D421F]",
                            )}
                          >
                            {row.cancelDate
                              ? formatDateOnly(row.cancelDate)
                              : "—"}
                          </td>
                          <td className="px-3 py-3 align-middle text-[#3D421F]">
                            <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                              <span
                                title="Company absorbed"
                                className={cn(
                                  row.penaltiesCompanyAbsorbed > 0
                                    ? "font-medium"
                                    : "text-black/35",
                                )}
                              >
                                {row.penaltiesCompanyAbsorbed > 0
                                  ? formatAed(row.penaltiesCompanyAbsorbed)
                                  : "—"}
                              </span>
                              <span
                                title="Employee absorbed"
                                className={cn(
                                  "inline-flex items-center gap-1",
                                  row.penaltiesEmployeeAbsorbed > 0
                                    ? "font-medium text-amber-800"
                                    : "text-black/35",
                                )}
                              >
                                {row.penaltiesEmployeeAbsorbed > 0 ? (
                                  <>
                                    <button
                                      type="button"
                                      className="underline decoration-amber-700/40 underline-offset-2 transition hover:decoration-amber-800"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPenaltyDeductionsRow(row);
                                      }}
                                      title="View payroll deductions applied"
                                    >
                                      {formatAed(row.penaltiesEmployeeAbsorbed)}
                                    </button>
                                    {row.penaltiesEmployeePayrollApplied ? (
                                      <span
                                        className="inline-flex"
                                        title="Fully deducted on payroll"
                                      >
                                        <Check
                                          className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                                          aria-label="Fully deducted on payroll"
                                        />
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex"
                                        title="Not fully applied on payroll"
                                      >
                                        <X
                                          className="h-3.5 w-3.5 shrink-0 text-red-600"
                                          aria-label="Not fully applied on payroll"
                                        />
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </span>
                            </div>
                          </td>
                          {canManage ? (
                            <td
                              className="bg-black/[0.04] px-3 py-3 text-center align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canShowVisaCancelationAction(row) ? (
                                <button
                                  type="button"
                                  className={cn(
                                    "inline-flex h-8 w-[9rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition",
                                    row.cancelDate || row.isCanceled
                                      ? "border-red-300/80 bg-red-100 text-red-900 hover:bg-red-200/80"
                                      : "border-black/15 bg-white text-[#3D421F] hover:bg-black/5",
                                  )}
                                  onClick={() => setCancelationRow(row)}
                                >
                                  <UserRoundX
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0",
                                      (row.cancelDate || row.isCanceled) &&
                                        "text-red-800",
                                    )}
                                    aria-hidden
                                  />
                                  {row.cancelDate || row.isCanceled
                                    ? "Edit cancelation"
                                    : "Apply cancelation"}
                                </button>
                              ) : canShowVisaIssueAction(row) ? (
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-[9rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-300/80 bg-emerald-100 px-2.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-200/80"
                                  onClick={() => setIssueRow(row)}
                                >
                                  <Mail
                                    className="h-3.5 w-3.5 shrink-0 text-emerald-800"
                                    aria-hidden
                                  />
                                  Issue visa
                                </button>
                              ) : (
                                <span className="text-black/30">—</span>
                              )}
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

      <VisaEmployeeEditDialog
        row={editRow}
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
        onSaved={() => router.refresh()}
      />

      <VisaCancelationDialog
        open={Boolean(cancelationRow)}
        row={cancelationRow}
        venueId={venueId}
        onClose={() => setCancelationRow(null)}
        onSaved={() => {
          refreshDraftCount();
          router.refresh();
        }}
      />

      <VisaIssueDialog
        open={Boolean(issueRow)}
        row={issueRow}
        venueId={venueId}
        onClose={() => setIssueRow(null)}
        onSaved={() => {
          refreshDraftCount();
        }}
      />

      <VisaPenaltyDeductionsDialog
        open={Boolean(penaltyDeductionsRow)}
        row={penaltyDeductionsRow}
        onClose={() => setPenaltyDeductionsRow(null)}
      />

      {pendingOpen ? (
        <VisaPendingUploadsDialog
          open={pendingOpen}
          onOpenChange={setPendingOpen}
          items={pendingUploads}
          canManage={canManage}
          onUploaded={(itemKey) => {
            setUploadedPendingKeys((prev) => new Set(prev).add(itemKey));
          }}
        />
      ) : null}

      <VisaRequestEmailDialog
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

      <VisaRequestSentEmailsDialog
        open={sentOpen}
        onOpenChange={setSentOpen}
      />

      <VisaEmployeesExportDialog
        open={exportOpen}
        rows={rows}
        workingStatusOptions={workingStatuses.map((s) => s.name)}
        employmentStatusOptions={employmentStatuses.map((s) => s.name)}
        venueName={venueName}
        venueAddress={venueAddress}
        venueLogoUrl={venueLogoUrl}
        userDisplayName={userDisplayName}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
