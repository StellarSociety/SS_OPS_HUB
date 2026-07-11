"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  removeVenueTender,
  reorderVenueTendersAction,
  saveVenueTender,
} from "@/lib/actions/sales";
import {
  VENUE_TENDER_STATUS_LABELS,
  type VenueTender,
  type VenueTenderStatus,
} from "@/lib/sales/tenders-types";
import { SalesSortableTable } from "@/components/sales/sales-sortable-table";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type SalesTendersSettingsPanelProps = {
  tenders: VenueTender[];
  canEdit: boolean;
};

const EMPTY_FORM = {
  name: "",
  status: "active" as VenueTenderStatus,
};

export function SalesTendersSettingsPanel({
  tenders,
  canEdit,
}: SalesTendersSettingsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(tender: VenueTender) {
    setEditingId(tender.id);
    setForm({ name: tender.name, status: tender.status });
  }

  function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      if (editingId) formData.set("id", editingId);
      formData.set("name", form.name);
      formData.set("status", form.status);
      formData.set(
        "sort_order",
        String(editingId ? tenders.find((t) => t.id === editingId)?.sort_order ?? 0 : tenders.length + 1),
      );

      const result = await saveVenueTender(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved.");
      resetForm();
    });
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Remove tender "${name}"?`)) return;
    startTransition(async () => {
      const result = await removeVenueTender(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Tender removed.");
      if (editingId === id) resetForm();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">
            {editingId ? "Edit tender" : "Add tender"}
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Active tenders appear on the waiter sales entry form. Inactive tenders
            are hidden from entry.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-[#3D421F]">Name</span>
            <input
              type="text"
              disabled={!canEdit || isPending}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Visa, Cash"
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
                  status: e.target.value as VenueTenderStatus,
                }))
              }
              className="mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] disabled:opacity-60"
            >
              <option value="active">{VENUE_TENDER_STATUS_LABELS.active}</option>
              <option value="inactive">
                {VENUE_TENDER_STATUS_LABELS.inactive}
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
              {isPending ? "Saving…" : editingId ? "Update tender" : "Add tender"}
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
          <h3 className="font-serif text-lg text-[#3D421F]">Tender types</h3>
          {canEdit ? (
            <p className="mt-1 text-xs text-black/50">
              Drag the grip handle to change display order on waiter sales.
            </p>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-xs font-bold uppercase tracking-wide text-black">
                {canEdit ? <th className="w-10 px-2 py-3" /> : null}
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                {canEdit ? (
                  <th className="px-4 py-3 text-right">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              <SalesSortableTable
                items={tenders}
                canEdit={canEdit}
                onReorder={reorderVenueTendersAction}
                emptyMessage="No tenders configured yet."
                colSpan={canEdit ? 4 : 2}
                renderRow={(tender, dragHandle) => (
                  <>
                    {canEdit ? (
                      <td className="w-10 px-2 py-3 align-middle">{dragHandle}</td>
                    ) : null}
                    <td className="px-4 py-3 font-medium text-[#3D421F]">
                      {tender.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          tender.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-black/10 text-black/50",
                        )}
                      >
                        {VENUE_TENDER_STATUS_LABELS[tender.status]}
                      </span>
                    </td>
                    {canEdit ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => startEdit(tender)}
                            title="Edit tender"
                            className="rounded p-1.5 text-black/50 hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleDelete(tender.id, tender.name)}
                            title="Delete tender"
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
