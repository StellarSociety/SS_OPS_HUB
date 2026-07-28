"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  removeVenueWaiter,
  reorderVenueWaitersAction,
  saveVenueWaiter,
} from "@/lib/actions/sales";
import {
  VENUE_WAITER_STATUS_LABELS,
  type VenueWaiter,
  type VenueWaiterStatus,
  type WaiterStaffOption,
} from "@/lib/sales/waiters-types";
import { SalesSortableTable } from "@/components/sales/sales-sortable-table";
import { StatusBadge } from "@/components/hr/status-badge";
import { Card } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type SalesWaitersSettingsPanelProps = {
  waiters: VenueWaiter[];
  staffOptions: WaiterStaffOption[];
  canEdit: boolean;
};

const EMPTY_FORM = {
  staff_id: "",
  name: "",
  position: "",
  status: "active" as VenueWaiterStatus,
};

export function SalesWaitersSettingsPanel({
  waiters,
  staffOptions,
  canEdit,
}: SalesWaitersSettingsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const staffById = useMemo(() => {
    const map = new Map<string, WaiterStaffOption>();
    for (const s of staffOptions) map.set(s.id, s);
    return map;
  }, [staffOptions]);

  const linkedStaffIds = useMemo(() => {
    const used = new Set<string>();
    for (const w of waiters) {
      if (w.staff_id && w.id !== editingId) used.add(w.staff_id);
    }
    return used;
  }, [waiters, editingId]);

  const availableStaff = useMemo(
    () => staffOptions.filter((s) => !linkedStaffIds.has(s.id)),
    [staffOptions, linkedStaffIds],
  );

  const staffSelectOptions = useMemo(
    () =>
      availableStaff.map((s) => ({
        value: s.id,
        label: [
          s.full_name,
          s.emp_no ? `(${s.emp_no})` : null,
          s.position_name ? `— ${s.position_name}` : null,
          s.department_name ? `· ${s.department_name}` : null,
          s.terminated ? "(terminated)" : null,
        ]
          .filter(Boolean)
          .join(" "),
      })),
    [availableStaff],
  );

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(waiter: VenueWaiter) {
    const linked = waiter.staff_id
      ? staffById.get(waiter.staff_id)
      : undefined;
    setEditingId(waiter.id);
    setForm({
      staff_id: waiter.staff_id ?? "",
      name: waiter.name,
      position: linked?.position_name ?? waiter.position,
      status: waiter.status,
    });
  }

  function handleStaffChange(staffId: string) {
    if (!staffId) {
      setForm((prev) => ({ ...prev, staff_id: "" }));
      return;
    }
    const staff = staffById.get(staffId);
    if (!staff) return;
    setForm((prev) => ({
      ...prev,
      staff_id: staffId,
      name: staff.first_name || staff.full_name.split(/\s+/)[0] || staff.full_name,
      position: staff.position_name ?? "",
    }));
  }

  function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      if (editingId) formData.set("id", editingId);
      formData.set("staff_id", form.staff_id);
      formData.set("name", form.name);
      formData.set("position", form.position);
      formData.set("status", form.status);

      const result = await saveVenueWaiter(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved.");
      resetForm();
    });
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from the waiter roster?`)) return;
    startTransition(async () => {
      const result = await removeVenueWaiter(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Waiter removed.");
      if (editingId === id) {
        resetForm();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">
            {editingId ? "Edit waiter" : "Add waiter"}
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Link each waiter to an HR staff record so tips and benefits settle
            correctly. Active waiters appear when recording waiter sales.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="block min-w-0 text-sm">
            <span className="font-medium text-[#3D421F]">HR staff</span>
            <div
              className={cn(
                "mt-1",
                (!canEdit || isPending) && "pointer-events-none opacity-60",
              )}
            >
              <SearchableSelect
                value={form.staff_id}
                onChange={handleStaffChange}
                options={staffSelectOptions}
                placeholder="Not linked"
                searchPlaceholder="Search by name, emp no, position…"
              />
            </div>
            {staffOptions.length === 0 ? (
              <span className="mt-1 block text-xs text-black/45">
                No HR staff found for this venue. Add people in Human Resources
                first.
              </span>
            ) : null}
          </div>
          <label className="block min-w-0 text-sm">
            <span className="font-medium text-[#3D421F]">Display name</span>
            <input
              type="text"
              disabled={!canEdit || isPending}
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="First name (editable)"
              title={
                form.staff_id
                  ? "Defaults to first name from HR — you can override it."
                  : undefined
              }
              className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] disabled:opacity-60"
            />
          </label>
          <label className="block min-w-0 text-sm">
            <span className="font-medium text-[#3D421F]">Position</span>
            <input
              type="text"
              readOnly={Boolean(form.staff_id)}
              disabled={!canEdit || isPending}
              value={form.position}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, position: e.target.value }))
              }
              placeholder={
                form.staff_id ? "From HR position" : "e.g. Server, Captain"
              }
              title={
                form.staff_id
                  ? "Filled from the selected HR staff position."
                  : undefined
              }
              className={cn(
                "mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] disabled:opacity-60",
                form.staff_id && "bg-black/[0.03] text-black/70",
              )}
            />
          </label>
          <label className="block min-w-0 text-sm">
            <span className="font-medium text-[#3D421F]">Visibility</span>
            <select
              disabled={!canEdit || isPending}
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status: e.target.value as VenueWaiterStatus,
                }))
              }
              title="Waiter Daily Sales Visibility — hidden waiters stay on the roster but do not appear when recording waiter sales."
              className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] disabled:opacity-60"
            >
              <option value="active">{VENUE_WAITER_STATUS_LABELS.active}</option>
              <option value="inactive">
                {VENUE_WAITER_STATUS_LABELS.inactive}
              </option>
            </select>
          </label>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--venue-primary)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : editingId ? "Update waiter" : "Add waiter"}
            </button>
            {editingId ? (
              <button
                type="button"
                disabled={isPending}
                onClick={resetForm}
                className="inline-flex h-10 items-center justify-center rounded-md border border-black/10 bg-white px-5 text-sm font-medium text-[#3D421F] hover:bg-[var(--venue-secondary)]/30 disabled:opacity-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-black/10 px-5 py-3">
          <h3 className="font-serif text-lg text-[#3D421F]">Waiter roster</h3>
          {canEdit ? (
            <p className="mt-1 text-xs text-black/50">
              Drag the grip handle to change display order on waiter sales.
            </p>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-xs font-bold uppercase tracking-wide text-black">
                {canEdit ? <th className="w-10 px-2 py-3" /> : null}
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">HR staff</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Employment status</th>
                <th className="px-4 py-3">Visibility</th>
                {canEdit ? (
                  <th className="px-4 py-3 text-right">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              <SalesSortableTable
                items={waiters}
                canEdit={canEdit}
                onReorder={reorderVenueWaitersAction}
                emptyMessage="No waiters yet. Add your first waiter above."
                colSpan={canEdit ? 7 : 5}
                renderRow={(waiter, dragHandle) => {
                  const linked = waiter.staff_id
                    ? staffById.get(waiter.staff_id)
                    : undefined;
                  return (
                    <>
                      {canEdit ? (
                        <td className="w-10 px-2 py-3 align-middle">
                          {dragHandle}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 font-medium text-[#3D421F]">
                        {waiter.name}
                      </td>
                      <td className="px-4 py-3 text-black/70">
                        {linked ? (
                          <span>
                            {linked.full_name}
                            {linked.emp_no ? (
                              <span className="text-black/45">
                                {" "}
                                · {linked.emp_no}
                              </span>
                            ) : null}
                          </span>
                        ) : waiter.staff_id ? (
                          <span className="text-amber-700">Linked (missing)</span>
                        ) : (
                          <span className="text-black/35">Not linked</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-black/70">
                        {waiter.position || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={linked?.employment_status_name}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            waiter.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-black/10 text-black/50",
                          )}
                        >
                          {VENUE_WAITER_STATUS_LABELS[waiter.status]}
                        </span>
                      </td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => startEdit(waiter)}
                              title="Edit waiter"
                              className="rounded p-1.5 text-black/50 hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                handleDelete(waiter.id, waiter.name)
                              }
                              title="Delete waiter"
                              className="rounded p-1.5 text-black/50 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </>
                  );
                }}
              />
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
