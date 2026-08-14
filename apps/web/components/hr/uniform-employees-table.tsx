"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { StatusBadge } from "@/components/hr/status-badge";
import { UniformReplacementDialog } from "@/components/hr/uniform-replacement-dialog";
import { UniformReplacementsListDialog } from "@/components/hr/uniform-replacements-list-dialog";
import { UniformStaffItemDialog } from "@/components/hr/uniform-staff-item-dialog";
import { UniformTermsEmailSendButton } from "@/components/hr/uniform-terms-email-send-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  archiveUniformStaff,
  deleteUniformStaffAssignments,
  deleteUniformStaffItem,
  unarchiveUniformStaff,
} from "@/lib/actions/hr-uniforms";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { isOutEmploymentStatus } from "@/lib/hr/employment-status";
import type {
  Department,
  EmploymentStatus,
  Position,
  StaffWithLookups,
  UniformPieceRow,
  UniformReplacementRow,
  UniformStaffItemRow,
  UniformStaffSummaryRow,
  UniformSupplierRow,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type UniformEmployeesTableProps = {
  rows: UniformStaffSummaryRow[];
  pieces: UniformPieceRow[];
  suppliers: UniformSupplierRow[];
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  canManage?: boolean;
};

type ArchiveFilter = "active" | "hidden" | "all";

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function UniformEmployeesTable({
  rows,
  pieces,
  suppliers,
  staff,
  departments,
  positions,
  statuses,
  canManage = false,
}: UniformEmployeesTableProps) {
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
  const [editItem, setEditItem] = useState<{
    staff: StaffWithLookups;
    item: UniformStaffItemRow;
  } | null>(null);
  const [replaceStaff, setReplaceStaff] = useState<StaffWithLookups | null>(
    null,
  );
  const [queriesStaff, setQueriesStaff] = useState<{
    staff: StaffWithLookups;
    replacements: UniformReplacementRow[];
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

  function handleDeleteItem(item: UniformStaffItemRow) {
    if (!window.confirm("Remove this uniform assignment?")) return;
    setActionId(item.id);
    startTransition(async () => {
      try {
        await deleteUniformStaffItem({ itemId: item.id });
        toast.saved("Uniform assignment removed.");
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not remove assignment.",
        );
      } finally {
        setActionId(null);
      }
    });
  }

  function handleArchiveToggle(row: UniformStaffSummaryRow) {
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
          await unarchiveUniformStaff({ staffId });
          toast.saved("Employee restored to the list.");
        } else {
          await archiveUniformStaff({ staffId });
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

  function handleDeleteStaff(row: UniformStaffSummaryRow) {
    if (
      !window.confirm(
        `Permanently remove all uniform assignments for ${row.staff.full_name}? This cannot be undone.`,
      )
    ) {
      return;
    }
    const staffId = row.staff.id;
    setActionId(`delete-${staffId}`);
    startTransition(async () => {
      try {
        await deleteUniformStaffAssignments({ staffId });
        toast.saved("Uniform assignments removed.");
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
            : "Could not delete uniform assignments.",
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
                : "No employees with uniform assignments yet."}
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
            const busyParent = pending && actionId != null;
            const archived = Boolean(row.archived);
            const hiddenByOut = isOutEmploymentStatus(
              row.staff.employment_status?.name,
            );
            const archiveBusy = pending && actionId === `archive-${row.staff.id}`;
            const deleteBusy = pending && actionId === `delete-${row.staff.id}`;
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
                      <col className="w-16" />
                      <col className="w-36" />
                      <col className="w-28" />
                      {canManage ? <col className="w-[5.25rem]" /> : null}
                    </colgroup>
                    <tbody>
                      <tr className="text-[#3D421F]">
                        <td className="px-4 py-3" colSpan={3}>
                          <div className="flex min-w-0 items-stretch gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(row.staff.id)}
                              className="shrink-0 self-center rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
                              aria-expanded={expanded}
                              aria-label={
                                expanded
                                  ? "Collapse uniform details"
                                  : "Expand uniform details"
                              }
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
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
                              <div className="font-medium text-[#3D421F]">
                                {row.staff.full_name}
                              </div>
                              <div className="mt-0.5 text-xs text-black/45">
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
                            <div className="flex w-[13.5rem] shrink-0 flex-col items-end justify-center gap-1">
                              {canManage ? (
                                <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                  <UniformTermsEmailSendButton
                                    staffId={row.staff.id}
                                    fullName={row.staff.full_name}
                                    empNo={row.staff.emp_no}
                                    disabled={row.items.length === 0}
                                  />
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setReplaceStaff(row.staff)}
                                      disabled={row.items.length === 0}
                                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-[var(--venue-primary,#6B7B3A)] transition hover:bg-[var(--venue-primary,#6B7B3A)]/15 disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Initiate uniform replacement"
                                      aria-label={`Replace uniforms for ${row.staff.full_name}`}
                                    >
                                      <RefreshCw className="h-5 w-5" />
                                      Replace
                                    </button>
                                    {(row.replacements?.length ?? 0) > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setQueriesStaff({
                                            staff: row.staff,
                                            replacements:
                                              row.replacements ?? [],
                                          })
                                        }
                                        className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--venue-primary,#6B7B3A)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white transition hover:opacity-90"
                                        title="View replacement queries"
                                        aria-label={`${row.replacements?.length ?? 0} replacement queries for ${row.staff.full_name}`}
                                      >
                                        {row.replacements?.length ?? 0}
                                      </button>
                                    ) : null}
                                  </div>
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
                                  aria-label={`${row.replacements?.length ?? 0} replacement queries`}
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
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => setAssignStaff(row.staff)}
                                className="inline-flex items-center gap-0.5 rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
                                aria-label={`Assign pieces to ${row.staff.full_name}`}
                                title="Assign pieces"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <Shirt className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={
                                  archiveBusy || deleteBusy || (archived && hiddenByOut)
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
                                title="Delete all uniform assignments"
                                aria-label={`Delete uniform assignments for ${row.staff.full_name}`}
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
                              colSpan={canManage ? 5 : 4}
                              className="border-t border-black/10 bg-black/[0.015] px-4 py-6 text-sm text-black/45"
                            >
                              No uniform pieces assigned yet.
                              {canManage ? (
                                <>
                                  {" "}
                                  <button
                                    type="button"
                                    className="font-medium text-[var(--venue-primary,#818a40)] hover:underline"
                                    onClick={() => setAssignStaff(row.staff)}
                                  >
                                    Assign first pieces
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
                                Uniform name
                              </th>
                              <th className="px-4 py-2.5 font-medium text-right">
                                Qty
                              </th>
                              <th className="px-4 py-2.5 font-medium">
                                Date provided
                              </th>
                              <th className="px-4 py-2.5 font-medium text-right">
                                Subtotal
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
                              const unit = item.piece?.unit_value ?? 0;
                              const subtotal = unit * item.quantity;
                              const busy = pending && actionId === item.id;
                              return (
                                <tr key={item.id} className="text-[#3D421F]">
                                  <td className="px-4 py-2.5 font-medium">
                                    {item.piece?.name ?? "Unknown piece"}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums">
                                    {item.quantity}
                                  </td>
                                  <td className="px-4 py-2.5 text-black/65">
                                    {formatDateOnly(item.provided_at)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-black/65">
                                    {subtotal > 0 ? formatAed(subtotal) : "—"}
                                  </td>
                                  {canManage ? (
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          type="button"
                                          disabled={busyParent}
                                          onClick={() =>
                                            setEditItem({
                                              staff: row.staff,
                                              item,
                                            })
                                          }
                                          className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
                                          aria-label="Edit assignment"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => handleDeleteItem(item)}
                                          className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700"
                                          aria-label="Delete assignment"
                                        >
                                          {busy ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Trash2 className="h-4 w-4" />
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

      <UniformStaffItemDialog
        open={Boolean(assignStaff) && !editItem}
        staff={assignStaff}
        pieces={pieces}
        suppliers={suppliers}
        departments={departments}
        positions={positions}
        onClose={() => setAssignStaff(null)}
        onSaved={refresh}
      />

      <UniformStaffItemDialog
        open={Boolean(editItem)}
        staff={editItem?.staff ?? null}
        pieces={pieces}
        suppliers={suppliers}
        departments={departments}
        positions={positions}
        item={editItem?.item ?? null}
        onClose={() => setEditItem(null)}
        onSaved={refresh}
      />

      <UniformReplacementDialog
        open={Boolean(replaceStaff)}
        staff={replaceStaff}
        items={
          rows.find((row) => row.staff.id === replaceStaff?.id)?.items ?? []
        }
        onClose={() => setReplaceStaff(null)}
        onSaved={refresh}
      />

      <UniformReplacementsListDialog
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
