"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { assignAsset } from "@/lib/actions/hr-assets";
import { formatDateOnly } from "@/lib/hr/derived";
import type {
  AssetRow,
  Department,
  EmploymentStatus,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import { toast } from "@/components/ui/toast";

type AssignAssetDialogProps = {
  open: boolean;
  asset: AssetRow | null;
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  onClose: () => void;
};

export function AssignAssetDialog({
  open,
  asset,
  staff,
  departments,
  positions,
  statuses,
  onClose,
}: AssignAssetDialogProps) {
  const [selectedStaff, setSelectedStaff] = useState<StaffWithLookups | null>(
    null,
  );
  const [assignedAt, setAssignedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedStaff(null);
    setAssignedAt(new Date().toISOString().slice(0, 10));
    setNotes("");
  }, [open, asset?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (staffPickerOpen) {
          setStaffPickerOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, staffPickerOpen]);

  if (!open || !asset) return null;

  const todayIso = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStaff) {
      toast.error("Select an employee to assign this asset.");
      return;
    }
    if (!assignedAt) {
      toast.error("Issued date is required.");
      return;
    }

    setPending(true);
    try {
      await assignAsset({
        assetId: asset!.id,
        staffId: selectedStaff.id,
        assignedAt,
        notes: notes.trim(),
      });
      toast.saved(`Assigned to ${selectedStaff.full_name}.`);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not assign asset.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Assign asset"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-lg overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
          <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Assign asset
              </p>
              <h2 className="font-serif text-xl text-[#3D421F]">{asset.name}</h2>
              <p className="mt-1 text-sm text-black/55">
                {asset.asset_type?.name ?? "Asset"}
                {asset.serial_no ? ` · ${asset.serial_no}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <div className="space-y-2">
              <Label>Employee</Label>
              <div className="flex gap-2">
                <div className="flex min-h-10 flex-1 items-center rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]">
                  {selectedStaff ? (
                    <span>
                      {selectedStaff.full_name}
                      <span className="text-black/45">
                        {" "}
                        · {selectedStaff.emp_no}
                      </span>
                    </span>
                  ) : (
                    <span className="text-black/45">No employee selected</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStaffPickerOpen(true)}
                >
                  Choose
                </Button>
              </div>
              {selectedStaff ? (
                <p className="text-xs text-black/45">
                  Joining date: {formatDateOnly(selectedStaff.joining_date)}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigned-at">Issued on</Label>
              <DateInput
                id="assigned-at"
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
              <Label htmlFor="assign-notes">Notes</Label>
              <Input
                id="assign-notes"
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
                {pending ? "Assigning…" : "Assign asset"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <StaffSearchDialog
        open={staffPickerOpen}
        overlayClassName="z-[210]"
        onClose={() => setStaffPickerOpen(false)}
        onSelect={(member) => {
          setSelectedStaff(member);
          setStaffPickerOpen(false);
        }}
        staff={staff}
        departments={departments}
        positions={positions}
        statuses={statuses}
      />
    </>
  );
}
