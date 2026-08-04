"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AssetTypePicker } from "@/components/hr/asset-type-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAsset, updateAsset } from "@/lib/actions/hr-assets";
import {
  ASSET_STATUS_LABELS,
  type AssetRow,
  type AssetStatus,
  type AssetType,
} from "@/lib/hr/types";
import { toast } from "@/components/ui/toast";

const selectClass =
  "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

type CreateAssetDialogProps = {
  open: boolean;
  assetTypes: AssetType[];
  asset?: AssetRow | null;
  fixedTypeId?: string;
  hideTypeField?: boolean;
  dialogTitle?: string;
  canManageTypes?: boolean;
  onClose: () => void;
  onTypesChange?: (types: AssetType[]) => void;
};

export function CreateAssetDialog({
  open,
  assetTypes,
  asset,
  fixedTypeId,
  hideTypeField = false,
  dialogTitle,
  canManageTypes = false,
  onClose,
  onTypesChange,
}: CreateAssetDialogProps) {
  const isEdit = Boolean(asset);
  const itemLabel = hideTypeField ? "uniform" : "asset";
  const [types, setTypes] = useState<AssetType[]>(assetTypes);
  const [assetTypeId, setAssetTypeId] = useState("");
  const [name, setName] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [description, setDescription] = useState("");
  const [assetValue, setAssetValue] = useState("");
  const [status, setStatus] = useState<AssetStatus>("available");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTypes(assetTypes);
    setAssetTypeId(
      asset?.asset_type_id ?? fixedTypeId ?? assetTypes[0]?.id ?? "",
    );
    setName(asset?.name ?? "");
    setSerialNo(asset?.serial_no ?? "");
    setDescription(asset?.description ?? "");
    setAssetValue(
      asset?.asset_value != null && asset.asset_value > 0
        ? String(asset.asset_value)
        : "",
    );
    setNotes(asset?.notes ?? "");
    setStatus(asset?.status ?? "available");
  }, [open, asset, assetTypes, fixedTypeId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleTypesChange(next: AssetType[]) {
    setTypes(next);
    onTypesChange?.(next);
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetTypeId || !name.trim()) {
      toast.error("Type and name are required.");
      return;
    }

    setPending(true);
    try {
      const parsedValue =
        assetValue.trim() === "" ? 0 : Number.parseFloat(assetValue);
      if (Number.isNaN(parsedValue) || parsedValue < 0) {
        toast.error("Enter a valid asset value.");
        setPending(false);
        return;
      }

      if (isEdit && asset) {
        await updateAsset({
          assetId: asset.id,
          assetTypeId,
          name: name.trim(),
          serialNo: serialNo.trim(),
          description: description.trim(),
          assetValue: parsedValue,
          notes: notes.trim(),
          status,
        });
        toast.saved(`${itemLabel.charAt(0).toUpperCase()}${itemLabel.slice(1)} updated.`);
      } else {
        await createAsset({
          assetTypeId,
          name: name.trim(),
          serialNo: serialNo.trim(),
          description: description.trim(),
          assetValue: parsedValue,
          notes: notes.trim(),
        });
        toast.saved(`${itemLabel.charAt(0).toUpperCase()}${itemLabel.slice(1)} added to catalog.`);
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not save ${itemLabel}.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={dialogTitle ?? (isEdit ? "Edit asset" : "Add asset")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              {hideTypeField ? "Uniform" : "Assets"}
            </p>
            <h2 className="font-serif text-xl text-[#3D421F]">
              {dialogTitle ?? (isEdit ? "Edit asset" : "Add asset")}
            </h2>
            {isEdit && asset?.assigned_staff_name ? (
              <p className="mt-1 text-sm text-black/55">
                Assigned to {asset.assigned_staff_name}
                {asset.assigned_staff_emp_no
                  ? ` · ${asset.assigned_staff_emp_no}`
                  : ""}
              </p>
            ) : null}
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
          {!hideTypeField ? (
            <div className="space-y-2">
              <Label htmlFor="asset-type">Type</Label>
              <AssetTypePicker
                id="asset-type"
                value={assetTypeId}
                types={types}
                onChange={setAssetTypeId}
                onTypesChange={handleTypesChange}
                disabled={pending}
                canManage={canManageTypes}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="asset-name">Name</Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kitchen iPad, MacBook Pro, Chef jacket M"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-serial">Serial / tag</Label>
            <Input
              id="asset-serial"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-value">Value (AED)</Label>
            <Input
              id="asset-value"
              type="number"
              min={0}
              step="0.01"
              value={assetValue}
              onChange={(e) => setAssetValue(e.target.value)}
              placeholder="Optional purchase / book value"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-description">Description</Label>
            <Input
              id="asset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-notes">Notes</Label>
            <Input
              id="asset-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional internal notes"
            />
          </div>

          {isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="asset-status">Status</Label>
              <select
                id="asset-status"
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
              >
                {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[])
                  .filter((option) =>
                    asset?.status === "assigned"
                      ? true
                      : option !== "assigned",
                  )
                  .map((option) => (
                    <option key={option} value={option}>
                      {ASSET_STATUS_LABELS[option]}
                    </option>
                  ))}
              </select>
              {asset?.status === "assigned" && status === "available" ? (
                <p className="text-xs text-black/45">
                  Saving as Available will close the current employee assignment.
                </p>
              ) : null}
            </div>
          ) : null}

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
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : dialogTitle?.startsWith("Add")
                    ? dialogTitle
                    : "Add asset"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
