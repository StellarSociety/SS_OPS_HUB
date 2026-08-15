"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AssignAssetsToStaffDialog } from "@/components/hr/assign-assets-to-staff-dialog";
import { AssetTermsEmailSendButton } from "@/components/hr/asset-terms-email-send-button";
import { AssetsReplacementDialog } from "@/components/hr/assets-replacement-dialog";
import { AssetsReplacementsListDialog } from "@/components/hr/assets-replacements-list-dialog";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { StatusBadge } from "@/components/hr/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  archiveAssetStaff,
  deleteAssetStaffAssignments,
  returnAsset,
  unarchiveAssetStaff,
} from "@/lib/actions/hr-assets";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { isOutEmploymentStatus } from "@/lib/hr/employment-status";
import type {
  AssetReplacementRow,
  AssetRow,
  AssetStaffItemRow,
  AssetStaffSummaryRow,
  Department,
  EmploymentStatus,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type AssetsEmployeesTableProps = {
  rows: AssetStaffSummaryRow[];
  availableAssets: AssetRow[];
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  canManage?: boolean;
};

type ArchiveFilter = "active" | "hidden" | "all";

function ActionCountBadge({
  count,
  title,
  ariaLabel,
  onClick,
}: {
  count: number;
  title?: string;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  if (count <= 0) {
    return <span className="inline-flex w-7 shrink-0" aria-hidden />;
  }
  const className =
    "inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--venue-primary,#6B7B3A)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white transition hover:opacity-90";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        className={className}
      >
        {count}
      </button>
    );
  }
  return (
    <span title={title} className={className}>
      {count}
    </span>
  );
}

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function AssetsEmployeesTable({
  rows,
  availableAssets,
  staff,
  departments,
  positions,
  statuses,
  canManage = false,
}: AssetsEmployeesTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [showAllStaff, setShowAllStaff] = useState(false);
  const [pinnedStaffIds, setPinnedStaffIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedStaffIds, setExpandedStaffIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assignStaff, setAssignStaff] = useState<StaffWithLookups | null>(null);
  const [replaceStaff, setReplaceStaff] = useState<StaffWithLookups | null>(
    null,
  );
  const [queriesStaff, setQueriesStaff] = useState<{
    staff: StaffWithLookups;
    replacements: AssetReplacementRow[];
  } | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const archived = Boolean(row.archived);
      if (archiveFilter === "active" && archived) return false;
      if (archiveFilter === "hidden" && !archived) return false;
      if (
        !showAllStaff &&
        row.items.length === 0 &&
        !pinnedStaffIds.has(row.staff.id)
      ) {
        return false;
      }
      if (departmentFilter && row.staff.department_id !== departmentFilter) {
        return false;
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
    showAllStaff,
    pinnedStaffIds,
    archiveFilter,
  ]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function toggleExpanded(staffId: string) {
    setExpandedStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  function stopRowToggle(event: MouseEvent) {
    event.stopPropagation();
  }

  function handleReturnItem(item: AssetStaffItemRow) {
    if (!window.confirm(`Return ${item.name} to available stock?`)) return;
    setActionId(item.assignment_id);
    startTransition(async () => {
      try {
        await returnAsset({ assetId: item.asset_id });
        toast.saved("Asset returned.");
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not return asset.",
        );
      } finally {
        setActionId(null);
      }
    });
  }

  function handleArchiveToggle(row: AssetStaffSummaryRow) {
    const staffId = row.staff.id;
    const archived = Boolean(row.archived);
    const hiddenByOut = isOutEmploymentStatus(
      row.staff.employment_status?.name,
    );
    if (archived && hiddenByOut) {
      toast.error(
        "Employees with employment status OUT stay hidden. Change their status to restore them.",
      );
      return;
    }
    setActionId(`archive-${staffId}`);
    startTransition(async () => {
      try {
        if (archived) {
          await unarchiveAssetStaff({ staffId });
          toast.saved("Employee restored to the list.");
        } else {
          await archiveAssetStaff({ staffId });
          toast.saved("Employee hidden from the list.");
        }
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : archived
              ? "Could not restore employee."
              : "Could not hide employee.",
        );
      } finally {
        setActionId(null);
      }
    });
  }

  function handleDeleteStaff(row: AssetStaffSummaryRow) {
    if (
      !window.confirm(
        `Return all assigned assets for ${row.staff.full_name} and remove them from this list?`,
      )
    ) {
      return;
    }
    const staffId = row.staff.id;
    setActionId(`delete-${staffId}`);
    startTransition(async () => {
      try {
        await deleteAssetStaffAssignments({ staffId });
        toast.saved("Asset assignments cleared.");
        setPinnedStaffIds((prev) => {
          const next = new Set(prev);
          next.delete(staffId);
          return next;
        });
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not clear asset assignments.",
        );
      } finally {
        setActionId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="pl-9"
            />
          </div>
          <select
            className={selectClass}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={archiveFilter}
            onChange={(e) => setArchiveFilter(e.target.value as ArchiveFilter)}
            aria-label="Filter hidden employees"
          >
            <option value="active">Visible</option>
            <option value="hidden">Hidden</option>
            <option value="all">All (incl. hidden)</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-black/65">
            <input
              type="checkbox"
              checked={showAllStaff}
              onChange={(e) => setShowAllStaff(e.target.checked)}
              className="rounded border-black/20"
            />
            Show all staff
          </label>
        </div>
        {canManage ? (
          <Button onClick={() => setPickerOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add employee
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {showAllStaff
              ? "No employees match your filters."
              : archiveFilter === "hidden"
                ? "No hidden employees."
                : "No employees with asset assignments yet."}
          </p>
          {canManage ? (
            <Button onClick={() => setPickerOpen(true)} className="mt-3">
              Add employee
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const expanded = expandedStaffIds.has(row.staff.id);
            const archived = Boolean(row.archived);
            const hiddenByOut = isOutEmploymentStatus(
              row.staff.employment_status?.name,
            );
            const archiveBusy =
              pending && actionId === `archive-${row.staff.id}`;
            const deleteBusy =
              pending && actionId === `delete-${row.staff.id}`;
            return (
              <div
                key={row.staff.id}
                className={cn(
                  "overflow-hidden rounded-xl border border-black/10 bg-white/70",
                  archived && "bg-black/[0.02] opacity-80",
                )}
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <colgroup>
                      <col />
                      <col className="w-28" />
                      <col className="w-28" />
                      {canManage ? <col className="w-[5.25rem]" /> : null}
                    </colgroup>
                    <tbody>
                      <tr
                        className="cursor-pointer text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/40"
                        onClick={() => toggleExpanded(row.staff.id)}
                      >
                        <td className="px-4 py-3" colSpan={2}>
                          <div className="flex min-w-0 items-stretch gap-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                stopRowToggle(event);
                                toggleExpanded(row.staff.id);
                              }}
                              className="shrink-0 self-center rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
                              aria-expanded={expanded}
                              aria-label={
                                expanded
                                  ? "Collapse asset details"
                                  : "Expand asset details"
                              }
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <div
                              onClick={stopRowToggle}
                              className="flex shrink-0 self-stretch"
                            >
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
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-[#3D421F]">
                                {row.staff.full_name}
                              </div>
                              <div className="mt-0.5 text-xs text-black/45">
                                <span onClick={stopRowToggle}>
                                <StaffDirectoryLink
                                  staffId={row.staff.id}
                                  empNo={row.staff.emp_no}
                                />
                                </span>
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
                            <div
                              className="flex shrink-0 flex-col items-end justify-center gap-1"
                              onClick={stopRowToggle}
                            >
                              {canManage ? (
                                <div className="grid w-[16.5rem] grid-cols-[minmax(0,1fr)_2rem_6.25rem_2rem] items-center justify-items-start gap-x-1">
                                  <AssetTermsEmailSendButton
                                    staffId={row.staff.id}
                                    fullName={row.staff.full_name}
                                    empNo={row.staff.emp_no}
                                    sentCount={row.terms_email_count ?? 0}
                                    disabled={row.items.length === 0}
                                    className="justify-self-end"
                                  />
                                  <ActionCountBadge
                                    count={row.terms_email_count ?? 0}
                                    title={
                                      (row.terms_email_count ?? 0) > 0
                                        ? `${row.terms_email_count} T&Cs email${row.terms_email_count === 1 ? "" : "s"} sent`
                                        : undefined
                                    }
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setReplaceStaff(row.staff)}
                                    disabled={row.items.length === 0}
                                    className="inline-flex items-center justify-self-start gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-[var(--venue-primary,#6B7B3A)] transition hover:bg-[var(--venue-primary,#6B7B3A)]/15 disabled:cursor-not-allowed disabled:opacity-40"
                                    title="Initiate asset replacement"
                                    aria-label={`Replace assets for ${row.staff.full_name}`}
                                  >
                                    <RefreshCw className="h-5 w-5" />
                                    Replace
                                  </button>
                                  <ActionCountBadge
                                    count={row.replacements?.length ?? 0}
                                    title="View replacement queries"
                                    ariaLabel={`${row.replacements?.length ?? 0} replacement queries for ${row.staff.full_name}`}
                                    onClick={() =>
                                      setQueriesStaff({
                                        staff: row.staff,
                                        replacements: row.replacements ?? [],
                                      })
                                    }
                                  />
                                </div>
                              ) : (row.replacements?.length ?? 0) > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQueriesStaff({
                                      staff: row.staff,
                                      replacements: row.replacements ?? [],
                                    })
                                  }
                                  className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--venue-primary,#6B7B3A)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white transition hover:opacity-90"
                                  title="View replacement queries"
                                  aria-label={`${row.replacements?.length ?? 0} replacement queries for ${row.staff.full_name}`}
                                >
                                  {row.replacements?.length ?? 0}
                                </button>
                              ) : null}
                              {(row.pending_deduction_total ?? 0) > 0 ? (
                                <span className="text-[10px] font-medium tabular-nums text-amber-800">
                                  Pending{" "}
                                  {formatAed(row.pending_deduction_total ?? 0)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="w-28 px-4 py-3 text-right font-medium tabular-nums">
                          {row.total_value > 0
                            ? formatAed(row.total_value)
                            : "—"}
                        </td>
                        {canManage ? (
                          <td className="w-[5.25rem] px-4 py-3">
                            <div
                              className="flex items-center justify-end gap-0.5"
                              onClick={stopRowToggle}
                            >
                              <button
                                type="button"
                                onClick={() => setAssignStaff(row.staff)}
                                className="inline-flex items-center gap-0.5 rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
                                aria-label={`Assign assets to ${row.staff.full_name}`}
                                title="Assign assets"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <Package className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={
                                  archiveBusy ||
                                  deleteBusy ||
                                  (archived && hiddenByOut)
                                }
                                onClick={() => handleArchiveToggle(row)}
                                className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
                                title={
                                  archived && hiddenByOut
                                    ? "Hidden while employment status is OUT"
                                    : archived
                                      ? "Restore to visible list"
                                      : "Hide from list"
                                }
                                aria-label={
                                  archived && hiddenByOut
                                    ? `${row.staff.full_name} is hidden while employment status is OUT`
                                    : archived
                                      ? `Restore ${row.staff.full_name}`
                                      : `Hide ${row.staff.full_name}`
                                }
                              >
                                {archiveBusy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : archived ? (
                                  <ArchiveRestore className="h-4 w-4" />
                                ) : (
                                  <Archive className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={archiveBusy || deleteBusy}
                                onClick={() => handleDeleteStaff(row)}
                                className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                title="Return all assigned assets"
                                aria-label={`Clear asset assignments for ${row.staff.full_name}`}
                              >
                                {deleteBusy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    </tbody>

                    {expanded ? (
                      row.items.length === 0 ? (
                        <tbody>
                          <tr>
                            <td
                              colSpan={canManage ? 4 : 3}
                              className="border-t border-black/10 bg-black/[0.015] px-4 py-6 text-sm text-black/45"
                            >
                              No assets assigned yet.
                              {canManage ? (
                                <>
                                  {" "}
                                  <button
                                    type="button"
                                    className="font-medium text-[var(--venue-primary,#818a40)] hover:underline"
                                    onClick={() => setAssignStaff(row.staff)}
                                  >
                                    Assign first assets
                                  </button>
                                </>
                              ) : null}
                            </td>
                          </tr>
                        </tbody>
                      ) : (
                        <>
                          <thead className="border-t border-black/10 bg-black/[0.015] text-left text-xs uppercase tracking-wide text-black/45">
                            <tr>
                              <th className="px-4 py-2.5 font-medium">
                                Asset
                              </th>
                              <th className="px-4 py-2.5 font-medium">
                                Issued
                              </th>
                              <th className="px-4 py-2.5 font-medium text-right">
                                Value
                              </th>
                              {canManage ? (
                                <th className="px-4 py-2.5 font-medium text-right">
                                  Actions
                                </th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5 bg-black/[0.015]">
                            {row.items.map((item) => {
                              const busy =
                                pending && actionId === item.assignment_id;
                              return (
                                <tr
                                  key={item.assignment_id}
                                  className="text-[#3D421F]"
                                >
                                  <td className="px-4 py-2.5 font-medium">
                                    <span className="block">{item.name}</span>
                                    <span className="block text-xs font-normal text-black/45">
                                      {item.asset_type?.name ?? "Asset"}
                                      {item.serial_no
                                        ? ` · ${item.serial_no}`
                                        : ""}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-black/65">
                                    {formatDateOnly(item.assigned_at)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-black/65">
                                    {item.asset_value > 0
                                      ? formatAed(item.asset_value)
                                      : "—"}
                                  </td>
                                  {canManage ? (
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => handleReturnItem(item)}
                                          className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--venue-primary,#6B7B3A)] transition hover:bg-[var(--venue-primary,#6B7B3A)]/15 disabled:opacity-50"
                                          aria-label="Return asset"
                                        >
                                          {busy ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            "Return"
                                          )}
                                        </button>
                                      </div>
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </>
                      )
                    ) : null}
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StaffSearchDialog
        open={pickerOpen}
        staff={staff}
        departments={departments}
        positions={positions}
        statuses={statuses}
        onClose={() => setPickerOpen(false)}
        onSelect={(member) => {
          setPickerOpen(false);
          setAssignStaff(member);
          setPinnedStaffIds((prev) => new Set(prev).add(member.id));
          setExpandedStaffIds((prev) => new Set(prev).add(member.id));
        }}
      />

      <AssignAssetsToStaffDialog
        open={Boolean(assignStaff)}
        staff={assignStaff}
        availableAssets={availableAssets}
        onClose={() => setAssignStaff(null)}
        onSaved={refresh}
      />

      <AssetsReplacementDialog
        open={Boolean(replaceStaff)}
        staff={replaceStaff}
        items={
          rows.find((row) => row.staff.id === replaceStaff?.id)?.items ?? []
        }
        availableAssets={availableAssets}
        onClose={() => setReplaceStaff(null)}
        onSaved={refresh}
      />

      <AssetsReplacementsListDialog
        open={Boolean(queriesStaff)}
        staff={queriesStaff?.staff ?? null}
        replacements={
          rows.find((row) => row.staff.id === queriesStaff?.staff.id)
            ?.replacements ??
          queriesStaff?.replacements ??
          []
        }
        canManage={canManage}
        onClose={() => setQueriesStaff(null)}
        onChanged={refresh}
      />
    </div>
  );
}
