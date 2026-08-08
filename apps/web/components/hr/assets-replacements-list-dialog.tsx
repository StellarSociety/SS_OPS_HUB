"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { deleteAssetReplacement } from "@/lib/actions/hr-assets";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import type { AssetReplacementRow, StaffWithLookups } from "@/lib/hr/types";

export function AssetsReplacementsListDialog({
  open,
  staff,
  replacements,
  canManage = false,
  onClose,
  onChanged,
}: {
  open: boolean;
  staff: StaffWithLookups | null;
  replacements: AssetReplacementRow[];
  canManage?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingId) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pendingId]);

  if (!open || !staff || typeof document === "undefined") return null;

  async function handleDelete(row: AssetReplacementRow) {
    if (
      !window.confirm(
        `Delete replacement record for ${row.asset_name ?? "asset"}?`,
      )
    ) {
      return;
    }
    setPendingId(row.id);
    try {
      await deleteAssetReplacement({ replacementId: row.id });
      toast.saved("Replacement record deleted.");
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete replacement.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pendingId && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-replacements-title"
        className="flex max-h-[min(92dvh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Replacement history
            </p>
            <h2
              id="asset-replacements-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {staff.full_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(pendingId)}
            className="rounded-md p-1.5 text-black/45 hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {replacements.length === 0 ? (
            <p className="text-sm text-black/45">No replacements recorded.</p>
          ) : (
            <ul className="space-y-3">
              {replacements.map((row) => {
                const locked =
                  row.pending_deduction_status === "applied" ||
                  row.pending_deduction_status === "cleared";
                const busy = pendingId === row.id;
                return (
                  <li
                    key={row.id}
                    className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[#3D421F]">
                          {row.asset_name ?? "Asset"}
                          {row.asset_serial_no
                            ? ` · ${row.asset_serial_no}`
                            : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-black/50">
                          {formatDateOnly(row.created_at.slice(0, 10))} ·{" "}
                          {row.disposition === "lost"
                            ? "Marked lost"
                            : "Returned"}
                          {row.replacement_asset_name
                            ? ` · Replaced with ${row.replacement_asset_name}`
                            : ""}
                        </p>
                        <p className="mt-1 text-sm tabular-nums text-black/65">
                          {row.charged_to_employee
                            ? `Charged ${formatAed(row.deduction_amount)}`
                            : "Company-paid"}
                          {row.pending_deduction_status
                            ? ` · ${row.pending_deduction_status}`
                            : ""}
                        </p>
                      </div>
                      {canManage && !locked ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(row)}
                          className="rounded-md p-1.5 text-black/45 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                          aria-label="Delete replacement"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-black/10 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
