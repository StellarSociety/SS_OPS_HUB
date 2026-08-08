"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { assignAssetsToStaff } from "@/lib/actions/hr-assets";
import { formatAed } from "@/lib/hr/derived";
import type { AssetRow, StaffWithLookups } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type AssignAssetsToStaffDialogProps = {
  open: boolean;
  staff: StaffWithLookups | null;
  availableAssets: AssetRow[];
  onClose: () => void;
  onSaved?: () => void;
};

export function AssignAssetsToStaffDialog({
  open,
  staff,
  availableAssets,
  onClose,
  onSaved,
}: AssignAssetsToStaffDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignedAt, setAssignedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedIds(new Set());
    setAssignedAt(new Date().toISOString().slice(0, 10));
    setNotes("");
  }, [open, staff?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableAssets;
    return availableAssets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(q) ||
        asset.serial_no.toLowerCase().includes(q) ||
        (asset.asset_type?.name.toLowerCase().includes(q) ?? false),
    );
  }, [availableAssets, search]);

  if (!open || !staff) return null;

  const member = staff;
  const todayIso = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) {
      toast.error("Select at least one available asset.");
      return;
    }
    if (!assignedAt) {
      toast.error("Issued date is required.");
      return;
    }

    setPending(true);
    try {
      const result = await assignAssetsToStaff({
        staffId: member.id,
        assetIds: [...selectedIds],
        assignedAt,
        notes: notes.trim(),
      });
      toast.saved(
        `Assigned ${result.assigned} asset${result.assigned === 1 ? "" : "s"} to ${member.full_name}.`,
      );
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not assign assets.",
      );
    } finally {
      setPending(false);
    }
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Assign assets"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Assign assets
            </p>
            <h2 className="font-serif text-xl text-[#3D421F]">
              {staff.full_name}
            </h2>
            <p className="mt-1 text-sm text-black/55">{staff.emp_no}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="assign-assets-search">Available assets</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
              <Input
                id="assign-assets-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, serial, type…"
                className="pl-9"
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-black/10 bg-white p-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-black/45">
                  No available assets match.
                </p>
              ) : (
                filtered.map((asset) => {
                  const checked = selectedIds.has(asset.id);
                  return (
                    <label
                      key={asset.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition hover:bg-black/[0.03]",
                        checked && "bg-[var(--venue-primary)]/10",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(asset.id)}
                        className="mt-1 rounded border-black/20"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[#3D421F]">
                          {asset.name}
                        </span>
                        <span className="block text-xs text-black/50">
                          {asset.asset_type?.name ?? "Asset"}
                          {asset.serial_no ? ` · ${asset.serial_no}` : ""}
                          {asset.asset_value > 0
                            ? ` · ${formatAed(asset.asset_value)}`
                            : ""}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-black/45">
              {selectedIds.size} selected
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-assets-at">Issued on</Label>
            <DateInput
              id="assign-assets-at"
              value={assignedAt}
              onChange={setAssignedAt}
              maxDate={todayIso}
              disabled={pending}
              className="w-full"
              inputClassName="h-10 w-full"
              aria-label="Issued on"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-assets-notes">Notes</Label>
            <Input
              id="assign-assets-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional handover notes"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              className="text-[#3D421F]"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Assigning…" : "Assign assets"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
