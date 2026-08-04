"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { UniformStaffItemDialog } from "@/components/hr/uniform-staff-item-dialog";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { deleteUniformStaffItem } from "@/lib/actions/hr-uniforms";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import type {
  Department,
  EmploymentStatus,
  Position,
  StaffWithLookups,
  UniformPieceRow,
  UniformStaffItemRow,
  UniformStaffSummaryRow,
} from "@/lib/hr/types";

type UniformEmployeesTableProps = {
  rows: UniformStaffSummaryRow[];
  pieces: UniformPieceRow[];
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  canManage?: boolean;
};

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function UniformEmployeesTable({
  rows,
  pieces,
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
  const [showAllStaff, setShowAllStaff] = useState(false);
  const [pinnedStaffIds, setPinnedStaffIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedStaffIds, setExpandedStaffIds] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.items.length > 0).map((r) => r.staff.id)),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assignStaff, setAssignStaff] = useState<StaffWithLookups | null>(null);
  const [editItem, setEditItem] = useState<{
    staff: StaffWithLookups;
    item: UniformStaffItemRow;
  } | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
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
  }, [rows, search, departmentFilter, showAllStaff, pinnedStaffIds]);

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
            return (
              <div
                key={row.staff.id}
                className="overflow-hidden rounded-xl border border-black/10 bg-white/70"
              >
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(row.staff.id)}
                      className="mt-0.5 rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
                      aria-expanded={expanded}
                      aria-label={
                        expanded ? "Collapse uniform details" : "Expand uniform details"
                      }
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <ScopedLink
                        href={`/hr/${row.staff.id}`}
                        className="font-medium text-[#3D421F] hover:underline"
                      >
                        {row.staff.full_name}
                      </ScopedLink>
                      <p className="text-xs text-black/45">
                        {row.staff.emp_no}
                        {row.staff.department?.name
                          ? ` · ${row.staff.department.name}`
                          : ""}
                        {row.staff.position?.name
                          ? ` · ${row.staff.position.name}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-7 sm:pl-0">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-black/45">
                        Total value
                      </p>
                      <p className="font-medium tabular-nums text-[#3D421F]">
                        {row.total_value > 0 ? formatAed(row.total_value) : "—"}
                      </p>
                    </div>
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[#3D421F]"
                        onClick={() => setAssignStaff(row.staff)}
                      >
                        Assign pieces
                      </Button>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-black/10 bg-black/[0.015]">
                    {row.items.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-black/45">
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
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/45">
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
                          <tbody className="divide-y divide-black/5">
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
                          <tfoot className="border-t border-black/10 bg-black/[0.02]">
                            <tr className="font-medium text-[#3D421F]">
                              <td className="px-4 py-2.5" colSpan={3}>
                                Total value
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {row.total_value > 0
                                  ? formatAed(row.total_value)
                                  : "—"}
                              </td>
                              {canManage ? <td className="px-4 py-2.5" /> : null}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
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
        onClose={() => setAssignStaff(null)}
        onSaved={refresh}
      />

      <UniformStaffItemDialog
        open={Boolean(editItem)}
        staff={editItem?.staff ?? null}
        pieces={pieces}
        item={editItem?.item ?? null}
        onClose={() => setEditItem(null)}
        onSaved={refresh}
      />
    </div>
  );
}
