"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, X } from "lucide-react";
import { UniformReplacementEmailSendButton } from "@/components/hr/uniform-replacement-email-send-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  initiateUniformReplacement,
  type InitiateUniformReplacementResult,
} from "@/lib/actions/hr-uniforms";
import { formatAed } from "@/lib/hr/derived";
import type {
  StaffWithLookups,
  UniformStaffItemRow,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type LineDraft = {
  staffItemId: string;
  selected: boolean;
  quantity: string;
  maxQty: number;
  name: string;
  unitValue: number;
};

export function UniformReplacementDialog({
  open,
  staff,
  items,
  onClose,
  onSaved,
}: {
  open: boolean;
  staff: StaffWithLookups | null;
  items: UniformStaffItemRow[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [chargedToEmployee, setChargedToEmployee] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InitiateUniformReplacementResult | null>(
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
        staffItemId: item.id,
        selected: false,
        quantity: String(Math.min(1, item.quantity)),
        maxQty: item.quantity,
        name: item.piece?.name ?? "Uniform piece",
        unitValue: item.piece?.unit_value ?? 0,
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
    () =>
      lines.filter((line) => {
        if (!line.selected) return false;
        const qty = Number(line.quantity);
        return Number.isFinite(qty) && qty >= 1 && qty <= line.maxQty;
      }),
    [lines],
  );

  const deductionTotal = useMemo(
    () =>
      chargedToEmployee
        ? selectedLines.reduce((sum, line) => {
            const qty = Number(line.quantity);
            return sum + line.unitValue * qty;
          }, 0)
        : 0,
    [chargedToEmployee, selectedLines],
  );

  async function handleSubmit() {
    if (!staff) return;
    if (selectedLines.length === 0) {
      setError("Select at least one piece to replace.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await initiateUniformReplacement({
        staffId: staff.id,
        chargedToEmployee,
        notes,
        lines: selectedLines.map((line) => ({
          staffItemId: line.staffItemId,
          quantity: Number(line.quantity),
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
        aria-labelledby="uniform-replacement-title"
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-6 py-4">
          <div>
            <h2
              id="uniform-replacement-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {result ? "Replacement recorded" : "Initiate replacement"}
            </h2>
            <p className="mt-1 text-sm text-black/55">
              {staff.emp_no} — {staff.full_name}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {!result ? (
            <>
              <div className="space-y-2">
                <Label>Pieces to replace</Label>
                {lines.length === 0 ? (
                  <p className="text-sm text-black/45">
                    No uniforms on hand for this employee.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {lines.map((line) => (
                      <li
                        key={line.staffItemId}
                        className="rounded-lg border border-black/10 bg-black/[0.015] px-3 py-2.5"
                      >
                        <label className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 rounded border-black/20"
                            checked={line.selected}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.staffItemId === line.staffItemId
                                    ? { ...row, selected: e.target.checked }
                                    : row,
                                ),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-[#3D421F]">
                              {line.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-black/45">
                              On hand {line.maxQty}
                              {line.unitValue > 0
                                ? ` · ${formatAed(line.unitValue)} each`
                                : ""}
                            </span>
                          </span>
                          <Input
                            type="number"
                            min={1}
                            max={line.maxQty}
                            value={line.quantity}
                            disabled={!line.selected}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.staffItemId === line.staffItemId
                                    ? { ...row, quantity: e.target.value }
                                    : row,
                                ),
                              )
                            }
                            className="h-8 w-20 text-right"
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-[#3D421F]">
                  Who pays for the replacement?
                </legend>
                <label className="flex items-start gap-2 rounded-lg border border-black/10 px-3 py-2.5 text-sm">
                  <input
                    type="radio"
                    name="replacement_payer"
                    className="mt-0.5"
                    checked={chargedToEmployee}
                    onChange={() => setChargedToEmployee(true)}
                  />
                  <span>
                    <span className="font-medium text-[#3D421F]">
                      Employee pays
                    </span>
                    <span className="mt-0.5 block text-xs text-black/50">
                      Deduct the replacement value from the next payroll.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-black/10 px-3 py-2.5 text-sm">
                  <input
                    type="radio"
                    name="replacement_payer"
                    className="mt-0.5"
                    checked={!chargedToEmployee}
                    onChange={() => setChargedToEmployee(false)}
                  />
                  <span>
                    <span className="font-medium text-[#3D421F]">
                      Company pays
                    </span>
                    <span className="mt-0.5 block text-xs text-black/50">
                      No salary deduction is queued.
                    </span>
                  </span>
                </label>
              </fieldset>

              {chargedToEmployee ? (
                <div className="rounded-lg border border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-2.5 text-sm text-[#3D421F]">
                  Deduction for next payroll:{" "}
                  <span className="font-medium tabular-nums">
                    {formatAed(deductionTotal)}
                  </span>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="replacement-notes">Notes (optional)</Label>
                <Input
                  id="replacement-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason / reference"
                />
              </div>

              {error ? (
                <p className="text-sm text-red-700">{error}</p>
              ) : null}
            </>
          ) : (
            <>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                <p className="font-medium">Replacement completed</p>
                <p className="mt-1 text-emerald-900/80">
                  Fresh pieces issued
                  {result.chargedToEmployee
                    ? ` · ${formatAed(result.deductionAmount)} queued for payroll (Import Deductions)`
                    : " · company-paid"}
                  .
                </p>
              </div>

              {result.chargedToEmployee && result.deductionAmount > 0 ? (
                <div className="space-y-3 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#3D421F]">
                      Notify employee by email
                    </p>
                    <p className="mt-0.5 text-xs text-black/55">
                      Optional — use the standard send flow to review and send a
                      deduction notice for{" "}
                      <span className="font-medium tabular-nums text-[#3D421F]">
                        {formatAed(result.deductionAmount)}
                      </span>
                      .
                    </p>
                  </div>
                  <UniformReplacementEmailSendButton
                    staffId={staff.id}
                    fullName={staff.full_name}
                    empNo={staff.emp_no}
                    replacementIds={result.replacementIds}
                    deductionAmount={result.deductionAmount}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-black/8 px-6 py-4">
          {!result ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                disabled={pending}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn(
                  "gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90",
                )}
                disabled={pending || selectedLines.length === 0}
                onClick={() => void handleSubmit()}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Confirm replacement
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
              onClick={onClose}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
