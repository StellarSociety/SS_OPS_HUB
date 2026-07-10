"use client";

import { useState, useTransition } from "react";
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
} from "@/lib/sales/waiters-types";
import { SalesSortableTable } from "@/components/sales/sales-sortable-table";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SalesWaitersSettingsPanelProps = {
  waiters: VenueWaiter[];
  canEdit: boolean;
};

const EMPTY_FORM = {
  name: "",
  position: "",
  status: "active" as VenueWaiterStatus,
};

export function SalesWaitersSettingsPanel({
  waiters,
  canEdit,
}: SalesWaitersSettingsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
  }

  function startEdit(waiter: VenueWaiter) {
    setEditingId(waiter.id);
    setForm({
      name: waiter.name,
      position: waiter.position,
      status: waiter.status,
    });
    setMessage(null);
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      if (editingId) formData.set("id", editingId);
      formData.set("name", form.name);
      formData.set("position", form.position);
      formData.set("status", form.status);

      const result = await saveVenueWaiter(formData);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage(result.success ?? "Saved.");
      resetForm();
    });
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from the waiter roster?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await removeVenueWaiter(id);
      setMessage(result.error ?? result.success ?? null);
      if (!result.error && editingId === id) {
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
            Active waiters appear when recording waiter sales. Inactive waiters
            are hidden from selection.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-[#3D421F]">Name</span>
            <input
              type="text"
              disabled={!canEdit || isPending}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Waiter name"
              className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] disabled:opacity-60"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[#3D421F]">Position</span>
            <input
              type="text"
              disabled={!canEdit || isPending}
              value={form.position}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, position: e.target.value }))
              }
              placeholder="e.g. Server, Captain"
              className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] disabled:opacity-60"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[#3D421F]">Status</span>
            <select
              disabled={!canEdit || isPending}
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  status: e.target.value as VenueWaiterStatus,
                }))
              }
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

        {message ? <p className="text-sm text-black/60">{message}</p> : null}
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
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-xs font-bold uppercase tracking-wide text-black">
                {canEdit ? <th className="w-10 px-2 py-3" /> : null}
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Status</th>
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
                colSpan={canEdit ? 5 : 3}
                renderRow={(waiter, dragHandle) => (
                  <>
                    {canEdit ? (
                      <td className="w-10 px-2 py-3 align-middle">{dragHandle}</td>
                    ) : null}
                    <td className="px-4 py-3 font-medium text-[#3D421F]">
                      {waiter.name}
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      {waiter.position || "—"}
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
                            onClick={() => handleDelete(waiter.id, waiter.name)}
                            title="Delete waiter"
                            className="rounded p-1.5 text-black/50 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </>
                )}
              />
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
