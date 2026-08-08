"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { FileCheck2, FileText, FileWarning, Mail, Search, UserRoundX } from "lucide-react";
import { CertificationEmployeeDocumentsDialog } from "@/components/hr/certification-employee-documents-dialog";
import {
  CertificationPendingUploadsDialog,
  collectPendingCertUploads,
} from "@/components/hr/certification-pending-uploads-dialog";
import { CertificationRequestEmailDialog } from "@/components/hr/certification-request-email-dialog";
import { CertificationRequestSentEmailsDialog } from "@/components/hr/certification-request-sent-emails-dialog";
import { StatusBadge } from "@/components/hr/status-badge";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { formatDateOnly } from "@/lib/hr/derived";
import { countCertRequestDraftUnits } from "@/lib/hr/certification-request-drafts-storage";
import {
  compareEmploymentStatusNames,
  EMPLOYMENT_STATUS_NAMES,
  isOffBoardEmploymentStatus,
  isOutEmploymentStatus,
  normalizeEmploymentStatusName,
} from "@/lib/hr/employment-status";
import type {
  CertificationEmployeeRow,
  CertificationStatus,
  CertificationType,
  Department,
  EmploymentStatus,
  StaffCertificationCell,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type CertificationsEmployeesTableProps = {
  rows: CertificationEmployeeRow[];
  types: CertificationType[];
  departments: Department[];
  employmentStatuses: EmploymentStatus[];
  venueId: string;
  canManage?: boolean;
};

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

/** Matches the Employee column width in the table below. */
const employeeColClass = "w-[32rem] min-w-[20rem] max-w-[32rem]";

/**
 * Checkbox (w-10 = 2.5rem) + Employee (32rem) combined width.
 * Search + department filter share this same flexible block.
 */
const leadingBlockClass = "w-full max-w-[calc(2.5rem+32rem)]";

const STATUS_FILTER_OPTIONS: CertificationStatus[] = [
  "missing",
  "expired",
  "expiring",
  "valid",
];

type StatusFilterMap = Record<string, Set<CertificationStatus>>;

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

function statusLabel(status: CertificationStatus): string {
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

const MANDATORY_CERT_FIELDS = new Set([
  "ohc_date",
  "basic_food_safety_date",
]);

function statusClass(
  status: CertificationStatus,
  mandatoryMissing = false,
): string {
  switch (status) {
    case "valid":
      return "text-emerald-800";
    case "expiring":
      return "text-amber-800";
    case "expired":
      return "text-red-700";
    default:
      return mandatoryMissing ? "text-red-700" : "text-black/45";
  }
}

function headerLabel(cert: CertificationType): string {
  return cert.label.trim() || cert.name;
}

function CertColumnStatusFilter({
  typeId,
  typeName,
  selected,
  onChange,
}: {
  typeId: string;
  typeName: string;
  selected: Set<CertificationStatus>;
  onChange: (typeId: string, next: Set<CertificationStatus>) => void;
}) {
  return (
    <div
      className="mt-1.5 flex flex-wrap justify-center gap-0.5 normal-case tracking-normal"
      onClick={(e) => e.stopPropagation()}
    >
      {STATUS_FILTER_OPTIONS.map((status) => {
        const active = selected.has(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            aria-label={`Filter ${typeName}: ${statusLabel(status)}`}
            title={statusLabel(status)}
            onClick={() => {
              const next = new Set(selected);
              if (next.has(status)) next.delete(status);
              else next.add(status);
              onChange(typeId, next);
            }}
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-medium leading-none transition",
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
  );
}

function CertCell({ cell }: { cell: StaffCertificationCell }) {
  const mandatoryMissing =
    cell.status === "missing" && MANDATORY_CERT_FIELDS.has(cell.staffField);
  const alert = cell.status === "expired" || mandatoryMissing;
  return (
    <td
      className={cn(
        "px-3 py-3 align-top text-center",
        alert && "rounded-md bg-red-50 ring-1 ring-inset ring-red-200/80",
      )}
    >
      <div
        className={cn(
          "text-xs font-medium",
          statusClass(cell.status, mandatoryMissing),
        )}
      >
        {statusLabel(cell.status)}
      </div>
      <div
        className={cn(
          "mt-1 text-[11px] leading-snug",
          alert ? "text-red-900" : "text-[#3D421F]",
        )}
      >
        <div>
          <span className={alert ? "text-red-700/70" : "text-black/40"}>
            Cert{" "}
          </span>
          {cell.certifiedAt ? formatDateOnly(cell.certifiedAt) : "—"}
        </div>
        <div>
          <span className={alert ? "text-red-700/70" : "text-black/40"}>
            Exp{" "}
          </span>
          {cell.expiresAt ? formatDateOnly(cell.expiresAt) : "—"}
        </div>
      </div>
      {cell.hasDocument ? (
        <div
          className="mt-2 flex justify-center"
          title="Certificate file uploaded"
        >
          <FileCheck2
            className="h-3.5 w-3.5 text-emerald-700"
            aria-label="Certificate file uploaded"
          />
        </div>
      ) : null}
    </td>
  );
}

function cellStatusForType(
  row: CertificationEmployeeRow,
  typeId: string,
): CertificationStatus {
  const cell = row.certifications.find((c) => c.certificationId === typeId);
  return cell?.status ?? "missing";
}

function rowHasMissingOrExpiring(row: CertificationEmployeeRow): boolean {
  return row.certifications.some(
    (c) => c.status === "missing" || c.status === "expiring",
  );
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

export function CertificationsEmployeesTable({
  rows,
  types,
  departments,
  employmentStatuses,
  venueId,
  canManage = false,
}: CertificationsEmployeesTableProps) {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<
    string[]
  >(() => defaultEmploymentStatusFilter(employmentStatuses));
  const [statusFilters, setStatusFilters] = useState<StatusFilterMap>({});
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
  const [docsRow, setDocsRow] = useState<CertificationEmployeeRow | null>(null);

  useEffect(() => {
    setSavedDraftCount(countCertRequestDraftUnits(venueId));
  }, [venueId, emailOpen]);

  function refreshDraftCount() {
    setSavedDraftCount(countCertRequestDraftUnits(venueId));
  }

  function setTypeStatusFilter(
    typeId: string,
    next: Set<CertificationStatus>,
  ) {
    setStatusFilters((prev) => {
      const copy = { ...prev };
      if (next.size === 0) {
        delete copy[typeId];
      } else {
        copy[typeId] = next;
      }
      return copy;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeStatusFilters = Object.entries(statusFilters).filter(
      ([, statuses]) => statuses.size > 0,
    );

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

      if (missingAttentionFilter && !rowHasMissingOrExpiring(row)) {
        return false;
      }

      if (hideUnselected && !selectedIds.has(row.staff.id)) {
        return false;
      }

      for (const [typeId, statuses] of activeStatusFilters) {
        if (!statuses.has(cellStatusForType(row, typeId))) {
          return false;
        }
      }

      if (!q) return true;
      return (
        row.staff.full_name.toLowerCase().includes(q) ||
        row.staff.emp_no.toLowerCase().includes(q) ||
        (row.staff.department?.name.toLowerCase().includes(q) ?? false) ||
        (row.staff.position?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    rows,
    search,
    departmentFilter,
    employmentStatusFilter,
    statusFilters,
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
      { id: string; name: string; rows: CertificationEmployeeRow[] }
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
      a: CertificationEmployeeRow,
      b: CertificationEmployeeRow,
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

  const colCount = 2 + types.length;

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

  const selectedStaff = useMemo(
    () =>
      rows
        .filter((r) => selectedIds.has(r.staff.id))
        .map((r) => ({
          id: r.staff.id,
          fullName: r.staff.full_name,
          empNo: r.staff.emp_no,
          workEmail: r.staff.work_email,
          personalEmail: r.staff.personal_email,
          suggestedCertificationIds: r.certifications
            .filter(
              (c) =>
                c.status === "missing" ||
                c.status === "expiring" ||
                c.status === "expired",
            )
            .map((c) => c.certificationId),
          certifications: r.certifications.map((c) => ({
            certificationId: c.certificationId,
            certifiedAt: c.certifiedAt,
            expiresAt: c.expiresAt,
            status: c.status,
          })),
        })),
    [rows, selectedIds],
  );

  const emailDialogStaff = useMemo(() => {
    if (selectedStaff.length > 0) return selectedStaff;
    // Drafts list / New request fallback: all venue employees.
    return rows.map((r) => ({
      id: r.staff.id,
      fullName: r.staff.full_name,
      empNo: r.staff.emp_no,
      workEmail: r.staff.work_email,
      personalEmail: r.staff.personal_email,
      suggestedCertificationIds: r.certifications
        .filter(
          (c) =>
            c.status === "missing" ||
            c.status === "expiring" ||
            c.status === "expired",
        )
        .map((c) => c.certificationId),
      certifications: r.certifications.map((c) => ({
        certificationId: c.certificationId,
        certifiedAt: c.certifiedAt,
        expiresAt: c.expiresAt,
        status: c.status,
      })),
    }));
  }, [selectedStaff, rows]);

  const pendingUploads = useMemo(() => {
    const all = collectPendingCertUploads(rows, types);
    if (uploadedPendingKeys.size === 0) return all;
    return all.filter((item) => !uploadedPendingKeys.has(item.key));
  }, [rows, types, uploadedPendingKeys]);

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

  const missingAttentionTargets = useMemo(
    () =>
      rows.filter(
        (row) =>
          isIncludedInMissingAction(row.staff.employment_status?.name) &&
          rowHasMissingOrExpiring(row),
      ),
    [rows],
  );

  function applyMissingAttention() {
    if (missingAttentionFilter) {
      setMissingAttentionFilter(false);
      setSelectedIds(new Set());
      setEmploymentStatusFilter(
        defaultEmploymentStatusFilter(employmentStatuses),
      );
      return;
    }

    setSearch("");
    setDepartmentFilter("");
    setStatusFilters({});
    setEmploymentStatusFilter(
      employmentStatusesForMissingAction(employmentStatuses),
    );
    setMissingAttentionFilter(true);
    setSelectedIds(
      new Set(missingAttentionTargets.map((row) => row.staff.id)),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center",
            leadingBlockClass,
          )}
        >
          <div className="relative min-w-0 flex-[1.2]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="pl-9"
            />
          </div>
          <select
            className={cn(selectClass, "min-w-0 flex-1")}
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
            className="min-w-0 flex-1 [&_button]:h-10 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-sm"
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
              title={
                selectedIds.size === 0
                  ? "Select employees first"
                  : "Show only selected employees"
              }
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

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
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
              <span>Certificates</span>
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  pendingCount > 0
                    ? "bg-red-600 text-white"
                    : "bg-black/5 text-black/40",
                )}
                aria-label={`${pendingCount} certificates pending upload`}
              >
                {pendingCount}
              </span>
            </button>
            <button
              type="button"
              onClick={applyMissingAttention}
              aria-pressed={missingAttentionFilter}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-medium shadow-sm transition",
                missingAttentionFilter
                  ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                  : missingAttentionTargets.length > 0
                    ? "border-amber-200 bg-white text-[#3D421F] hover:border-amber-300 hover:bg-amber-50/60"
                    : "border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.03]",
              )}
            >
              <UserRoundX
                className={cn(
                  "h-4 w-4",
                  missingAttentionFilter
                    ? "text-white"
                    : missingAttentionTargets.length > 0
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
                    : missingAttentionTargets.length > 0
                      ? "bg-amber-600 text-white"
                      : "bg-black/5 text-black/40",
                )}
                aria-label={`${missingAttentionTargets.length} employees missing or expiring certificates`}
              >
                {missingAttentionTargets.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailDialogStep("drafts-list");
                setEmailOpen(true);
              }}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-md border border-amber-300/70 bg-amber-100 px-3.5 text-sm font-medium text-amber-950 shadow-sm transition hover:bg-amber-200/80",
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
                aria-label={`${savedDraftCount} saved certification draft emails`}
              >
                {savedDraftCount}
              </span>
            </button>
            <Button
              type="button"
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
                "inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium text-[#3D421F] shadow-sm transition",
                "border-black/10 hover:bg-black/[0.03]",
              )}
            >
              <Mail className="h-4 w-4 text-black/40" aria-hidden />
              Sent
            </button>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <p className="text-center text-sm text-muted-foreground">
            No employees found for this venue.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
                <tr>
                  <th className="w-10 px-3 py-3">
                    {canManage ? (
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        aria-label="Select all visible employees"
                        className="h-4 w-4 rounded border-black/20"
                      />
                    ) : null}
                  </th>
                  <th className={cn("px-3 py-3 font-medium", employeeColClass)}>
                    Employee
                  </th>
                  {types.map((t) => {
                    const shown = headerLabel(t);
                    return (
                      <th
                        key={t.id}
                        className="min-w-[8.5rem] px-3 py-3 text-center font-medium align-top"
                        title={t.name}
                      >
                        <span className="block leading-snug">{shown}</span>
                        <CertColumnStatusFilter
                          typeId={t.id}
                          typeName={shown}
                          selected={
                            statusFilters[t.id] ?? new Set<CertificationStatus>()
                          }
                          onChange={setTypeStatusFilter}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="px-3 py-12 text-center text-sm text-muted-foreground"
                    >
                      No employees match your filters.
                    </td>
                  </tr>
                ) : (
                  departmentGroups.map((group) => (
                    <Fragment key={group.id}>
                      <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/55">
                        <td
                          colSpan={colCount}
                          className="px-3 py-2.5 font-nav text-xs font-semibold uppercase tracking-[0.08em] text-[#3D421F]"
                        >
                          {group.name}
                          <span className="ml-2 font-sans font-normal normal-case tracking-normal text-black/40">
                            {group.rows.length} employee
                            {group.rows.length === 1 ? "" : "s"}
                          </span>
                        </td>
                      </tr>
                      {group.rows.map((row) => {
                        const selected = selectedIds.has(row.staff.id);
                        const byId = new Map(
                          row.certifications.map((c) => [
                            c.certificationId,
                            c,
                          ]),
                        );
                        return (
                          <tr
                            key={row.staff.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setDocsRow(row)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDocsRow(row);
                              }
                            }}
                            className={cn(
                              "cursor-pointer border-b border-black/5 last:border-0 transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/40",
                              selected &&
                                "bg-[var(--venue-primary,#818a40)]/[0.06]",
                            )}
                          >
                            <td
                              className="px-3 py-3 align-top"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canManage ? (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleOne(row.staff.id)}
                                  aria-label={`Select ${row.staff.full_name}`}
                                  className="mt-1 h-4 w-4 rounded border-black/20"
                                />
                              ) : null}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-3 align-top",
                                employeeColClass,
                              )}
                            >
                              <div className="flex items-stretch gap-3">
                                <StaffPhotoThumbnail
                                  fullName={row.staff.full_name}
                                  photoUrl={row.staff.photo_url}
                                  size="fill"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-[#3D421F]">
                                    {row.staff.full_name}
                                  </div>
                                  <div
                                    className="mt-0.5 text-xs text-black/45"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <StaffDirectoryLink
                                      staffId={row.staff.id}
                                      empNo={row.staff.emp_no}
                                    />
                                    {row.staff.position?.name
                                      ? ` · ${row.staff.position.name}`
                                      : ""}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-black/45">
                                    <StatusBadge
                                      status={row.staff.employment_status?.name}
                                    />
                                    <span>
                                      Joined{" "}
                                      {row.staff.joining_date
                                        ? formatDateOnly(row.staff.joining_date)
                                        : "—"}
                                      {" · "}
                                      Terminated{" "}
                                      {row.staff.termination_date
                                        ? formatDateOnly(
                                            row.staff.termination_date,
                                          )
                                        : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            {types.map((t) => {
                              const cell = byId.get(t.id);
                              if (!cell) {
                                return (
                                  <td
                                    key={t.id}
                                    className="px-3 py-3 align-top text-center text-xs text-black/35"
                                  >
                                    —
                                  </td>
                                );
                              }
                              return <CertCell key={t.id} cell={cell} />;
                            })}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingOpen ? (
        <CertificationPendingUploadsDialog
          open={pendingOpen}
          onOpenChange={setPendingOpen}
          items={pendingUploads}
          canManage={canManage}
          onUploaded={(itemKey) => {
            setUploadedPendingKeys((prev) => new Set(prev).add(itemKey));
          }}
        />
      ) : null}

      {emailOpen ? (
        <CertificationRequestEmailDialog
          open={emailOpen}
          onOpenChange={(open) => {
            setEmailOpen(open);
            if (!open) refreshDraftCount();
          }}
          venueId={venueId}
          staff={emailDialogStaff}
          types={types}
          initialStep={emailDialogStep}
          onDraftsChanged={refreshDraftCount}
          onSent={() => {
            setSelectedIds(new Set());
            setEmailOpen(false);
            refreshDraftCount();
          }}
        />
      ) : null}

      {sentOpen ? (
        <CertificationRequestSentEmailsDialog
          open={sentOpen}
          onOpenChange={setSentOpen}
        />
      ) : null}

      {docsRow ? (
        <CertificationEmployeeDocumentsDialog
          open
          onOpenChange={(open) => {
            if (!open) setDocsRow(null);
          }}
          row={docsRow}
          types={types}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}
