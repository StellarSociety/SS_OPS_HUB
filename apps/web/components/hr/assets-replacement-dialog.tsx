"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, X } from "lucide-react";
import { AssetReplacementEmailSendButton } from "@/components/hr/asset-replacement-email-send-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  initiateAssetReplacement,
  type InitiateAssetReplacementResult,
} from "@/lib/actions/hr-assets";
import { formatAed } from "@/lib/hr/derived";
import type {
  AssetRow,
  AssetStaffItemRow,
  StaffWithLookups,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type LineDraft = {
  assignmentId: string;
  selected: boolean;
  disposition: "returned" | "lost";
  replacementAssetId: string;
  name: string;
  serialNo: string;
  unitValue: number;
};

export function AssetsReplacementDialog({
  open,
  staff,
  items,
  availableAssets,
  onClose,
  onSaved,
}: {
  open: boolean;
  staff: StaffWithLookups | null;
  items: AssetStaffItemRow[];
  availableAssets: AssetRow[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [chargedToEmployee, setChargedToEmployee] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InitiateAssetReplacementResult | null>(
    null,
  );

  useEffect(() => {
    if (!open || !staff) return;
    setChargedToEmployee(true);
    setNotes("");
    setError(null);
    setResult(null);
    setLines(
      items.map((item) => ({
        assignmentId: item.assignment_id,
        selected: false,
        disposition: "lost",
        replacementAssetId: "",
        name: item.name,
        serialNo: item.serial_no,
        unitValue: item.asset_value,
      })),
    );
  }, [open, staff, items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  const selectedLines = useMemo(
    () => lines.filter((line) => line.selected),
    [lines],
  );

  const deductionTotal = useMemo(
    () =>
      chargedToEmployee
        ? selectedLines.reduce((sum, line) => sum + line.unitValue, 0)
        : 0,
    [chargedToEmployee, selectedLines],
  );

  const takenReplacementIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of lines) {
      if (line.selected && line.replacementAssetId) {
        ids.add(line.replacementAssetId);
      }
    }
    return ids;
  }, [lines]);

  async function handleSubmit() {
    if (!staff) return;
    if (selectedLines.length === 0) {
      setError("Select at least one asset to replace.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await initiateAssetReplacement({
        staffId: staff.id,
        chargedToEmployee,
        notes,
        lines: selectedLines.map((line) => ({
          assignmentId: line.assignmentId,
          disposition: line.disposition,
          replacementAssetId: line.replacementAssetId || null,
        })),
      });
      setResult(created);
      toast.saved(
        created.chargedToEmployee
          ? `Replacement recorded. ${formatAed(created.deductionAmount)} queued for next payroll.`
          : "Replacement recorded (company-paid).",
      );
      onSaved?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not initiate replacement.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!open || !staff || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-replacement-title"
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Replace assets
            </p>
            <h2
              id="asset-replacement-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {staff.full_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1.5 text-black/45 hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {result ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                Replacement recorded
                {result.chargedToEmployee
                  ? ` · ${formatAed(result.deductionAmount)} queued for payroll`
                  : " · company-paid"}
                .
              </div>
              <ul className="space-y-1 text-sm text-[#3D421F]">
                {result.lines.map((line, index) => (
                  <li key={`${line.name}-${index}`}>
                    {line.name}
                    {line.serialNo ? ` (${line.serialNo})` : ""} —{" "}
                    {formatAed(line.lineValue)}
                  </li>
                ))}
              </ul>
              {result.chargedToEmployee && result.pendingDeductionId ? (
                <AssetReplacementEmailSendButton
                  staffId={staff.id}
                  replacementIds={result.replacementIds}
                  fullName={staff.full_name}
                  empNo={staff.emp_no}
                  deductionAmount={result.deductionAmount}
                />
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {lines.length === 0 ? (
                  <p className="text-sm text-black/45">
                    No assets currently assigned.
                  </p>
                ) : (
                  lines.map((line) => (
                    <div
                      key={line.assignmentId}
                      className={cn(
                        "rounded-lg border border-black/10 p-3",
                        line.selected && "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/5",
                      )}
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={line.selected}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.assignmentId === line.assignmentId
                                  ? { ...row, selected: e.target.checked }
                                  : row,
                              ),
                            )
                          }
                          className="mt-1 rounded border-black/20"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-[#3D421F]">
                            {line.name}
                          </span>
                          <span className="block text-xs text-black/50">
                            {line.serialNo ? `${line.serialNo} · ` : ""}
                            {formatAed(line.unitValue)}
                          </span>
                        </span>
                      </label>
                      {line.selected ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Disposition</Label>
                            <select
                              className="h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm"
                              value={line.disposition}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((row) =>
                                    row.assignmentId === line.assignmentId
                                      ? {
                                          ...row,
                                          disposition: e.target.value as
                                            | "returned"
                                            | "lost",
                                        }
                                      : row,
                                  ),
                                )
                              }
                            >
                              <option value="lost">Mark lost</option>
                              <option value="returned">Return to stock</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Issue replacement (optional)
                            </Label>
                            <select
                              className="h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm"
                              value={line.replacementAssetId}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((row) =>
                                    row.assignmentId === line.assignmentId
                                      ? {
                                          ...row,
                                          replacementAssetId: e.target.value,
                                        }
                                      : row,
                                  ),
                                )
                              }
                            >
                              <option value="">None</option>
                              {availableAssets
                                .filter(
                                  (asset) =>
                                    asset.id === line.replacementAssetId ||
                                    !takenReplacementIds.has(asset.id),
                                )
                                .map((asset) => (
                                  <option key={asset.id} value={asset.id}>
                                    {asset.name}
                                    {asset.serial_no
                                      ? ` (${asset.serial_no})`
                                      : ""}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-[#3D421F]">
                <input
                  type="checkbox"
                  checked={chargedToEmployee}
                  onChange={(e) => setChargedToEmployee(e.target.checked)}
                  className="rounded border-black/20"
                />
                Charge employee (payroll deduction)
              </label>

              {chargedToEmployee ? (
                <p className="text-sm font-medium tabular-nums text-amber-900">
                  Deduction total: {formatAed(deductionTotal)}
                </p>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="asset-replace-notes">Notes</Label>
                <Input
                  id="asset-replace-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>

              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-4">
          {result ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending || selectedLines.length === 0}
                onClick={() => void handleSubmit()}
                className="gap-1.5"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {pending ? "Saving…" : "Confirm replace"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
