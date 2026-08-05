"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  deleteUniformReplacement,
  updateUniformReplacement,
} from "@/lib/actions/hr-uniforms";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import type {
  StaffWithLookups,
  UniformReplacementRow,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

function isReplacementLocked(row: UniformReplacementRow): boolean {
  if (
    row.pending_deduction_status === "cleared" ||
    row.pending_deduction_status === "applied"
  ) {
    return row.payroll_editable === false;
  }
  return false;
}

function lockReason(row: UniformReplacementRow): string {
  const month = row.payroll_month?.slice(0, 7);
  if (month) {
    return `Already on locked/paid payroll (${month}). Reopen that month first.`;
  }
  return "This deduction is on a locked or paid payroll run and cannot be changed.";
}

function formatPayrollMonthShort(value: string | null | undefined): string {
  if (!value) return "Unknown month";
  const key = value.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  try {
    return new Date(`${key}-01T12:00:00`).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return key;
  }
}

function deductionSummary(row: UniformReplacementRow): {
  lines: string[];
  remainingLabel: string | null;
} {
  if (!row.charged_to_employee) {
    return { lines: ["Company pays"], remainingLabel: null };
  }

  const original = Number(row.original_amount ?? row.deduction_amount ?? 0);
  const remaining = Number(
    row.remaining_amount ??
      (row.pending_deduction_status === "cleared" ||
      row.pending_deduction_status === "applied"
        ? 0
        : original),
  );
  const apps = row.deduction_applications ?? [];
  const lines: string[] = [];

  if (apps.length > 0) {
    for (const app of apps) {
      lines.push(
        `Deducted ${formatAed(app.amount)} · ${formatPayrollMonthShort(app.payrollMonth)}`,
      );
    }
  } else if (Number(row.deducted_amount ?? 0) > 0) {
    lines.push(
      `Deducted ${formatAed(Number(row.deducted_amount))} · ${formatPayrollMonthShort(row.payroll_month)}`,
    );
  }

  const remainingLabel =
    remaining > 0
      ? `Pending ${formatAed(remaining)}`
      : apps.length > 0 || Number(row.deducted_amount ?? 0) > 0
        ? "Fully recovered"
        : `Pending ${formatAed(original)}`;

  return { lines, remainingLabel };
}

export function UniformReplacementsListDialog({
  open,
  staff,
  replacements,
  canManage = false,
  onClose,
  onChanged,
}: {
  open: boolean;
  staff: StaffWithLookups | null;
  replacements: UniformReplacementRow[];
  canManage?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [chargedToEmployee, setChargedToEmployee] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setError(null);
      setPending(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        if (editingId) {
          setEditingId(null);
          setError(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending, editingId]);

  function startEdit(row: UniformReplacementRow) {
    if (isReplacementLocked(row)) {
      toast.error(lockReason(row));
      return;
    }
    setEditingId(row.id);
    setQuantity(String(row.quantity));
    setChargedToEmployee(row.charged_to_employee);
    setNotes(row.notes ?? "");
    setError(null);
  }

  async function handleSave(row: UniformReplacementRow) {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      setError("Enter a valid quantity.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await updateUniformReplacement({
        replacementId: row.id,
        quantity: qty,
        chargedToEmployee,
        notes,
      });
      toast.saved(
        row.pending_deduction_status === "applied"
          ? "Replacement updated and payroll deduction synced."
          : "Replacement query updated.",
      );
      setEditingId(null);
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update replacement.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(row: UniformReplacementRow) {
    if (isReplacementLocked(row)) {
      toast.error(lockReason(row));
      return;
    }
    const payrollNote =
      row.pending_deduction_status === "applied"
        ? " This will also remove or adjust the deduction on that month's payroll."
        : "";
    if (
      !window.confirm(
        `Delete replacement for ${row.piece_name ?? "piece"} × ${row.quantity}?${payrollNote}`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await deleteUniformReplacement({ replacementId: row.id });
      toast.saved(
        row.pending_deduction_status === "applied"
          ? "Replacement deleted and payroll deduction synced."
          : "Replacement query deleted.",
      );
      if (editingId === row.id) setEditingId(null);
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete replacement.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!open || !staff || typeof document === "undefined") return null;

  const editing = replacements.find((row) => row.id === editingId) ?? null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="uniform-replacements-list-title"
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-6 py-4">
          <div>
            <h2
              id="uniform-replacements-list-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Replacement queries
            </h2>
            <p className="mt-1 text-sm text-black/55">
              {staff.emp_no} — {staff.full_name}
              {replacements.length > 0
                ? ` · ${replacements.length} quer${replacements.length === 1 ? "y" : "ies"}`
                : ""}
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {replacements.length === 0 ? (
            <p className="text-sm text-black/45">
              No replacement queries for this employee.
            </p>
          ) : (
            <ul className="space-y-2">
              {replacements.map((row) => {
                const locked = isReplacementLocked(row);
                const isEditing = editingId === row.id;
                const summary = deductionSummary(row);
                return (
                  <li
                    key={row.id}
                    className="rounded-lg border border-black/10 bg-black/[0.015] px-3 py-3"
                  >
                    {!isEditing ? (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#3D421F]">
                            {row.piece_name ?? "Uniform piece"} × {row.quantity}
                          </p>
                          <p className="mt-0.5 text-xs text-black/50">
                            Issued {formatDateOnly(row.created_at.slice(0, 10))}
                            {row.charged_to_employee
                              ? ` · Charge ${formatAed(
                                  Number(
                                    row.original_amount ?? row.deduction_amount,
                                  ),
                                )}`
                              : " · Company pays"}
                          </p>
                          {row.charged_to_employee ? (
                            <div className="mt-1.5 space-y-0.5 text-xs">
                              {summary.lines.map((line) => (
                                <p key={line} className="text-black/55">
                                  {line}
                                </p>
                              ))}
                              {summary.remainingLabel ? (
                                <p
                                  className={cn(
                                    "font-medium",
                                    Number(row.remaining_amount ?? 0) > 0
                                      ? "text-amber-800"
                                      : "text-[var(--venue-primary,#818a40)]",
                                  )}
                                >
                                  {summary.remainingLabel}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {row.notes ? (
                            <p className="mt-1 text-xs text-black/55">
                              {row.notes}
                            </p>
                          ) : null}
                          {locked ? (
                            <p className="mt-1 text-xs text-amber-800/80">
                              Locked — linked payroll is finalized.
                            </p>
                          ) : null}
                        </div>
                        {canManage ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              disabled={pending || locked}
                              onClick={() => startEdit(row)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                              aria-label="Edit replacement query"
                              title={locked ? lockReason(row) : "Edit"}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={pending || locked}
                              onClick={() => void handleDelete(row)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                              aria-label="Delete replacement query"
                              title={locked ? lockReason(row) : "Delete"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-[#3D421F]">
                          Edit {row.piece_name ?? "uniform piece"}
                        </p>
                        {row.pending_deduction_status === "applied" ? (
                          <p className="text-xs text-black/50">
                            Changes sync to this month's payroll deduction.
                          </p>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`repl-qty-${row.id}`}>
                              Quantity
                            </Label>
                            <Input
                              id={`repl-qty-${row.id}`}
                              type="number"
                              min={1}
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              disabled={pending}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Deduction</Label>
                            <p className="flex h-9 items-center text-sm tabular-nums text-[#3D421F]">
                              {chargedToEmployee
                                ? formatAed(
                                    row.unit_value * (Number(quantity) || 0),
                                  )
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <fieldset className="space-y-2">
                          <legend className="text-xs font-medium text-black/55">
                            Who pays?
                          </legend>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              checked={chargedToEmployee}
                              onChange={() => setChargedToEmployee(true)}
                              disabled={pending}
                            />
                            Employee pays
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              checked={!chargedToEmployee}
                              onChange={() => setChargedToEmployee(false)}
                              disabled={pending}
                            />
                            Company pays
                          </label>
                        </fieldset>
                        <div className="space-y-1.5">
                          <Label htmlFor={`repl-notes-${row.id}`}>Notes</Label>
                          <Input
                            id={`repl-notes-${row.id}`}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={pending}
                          />
                        </div>
                        {error ? (
                          <p className="text-sm text-red-700">{error}</p>
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                            disabled={pending}
                            onClick={() => {
                              setEditingId(null);
                              setError(null);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                            disabled={pending}
                            onClick={() => void handleSave(row)}
                          >
                            {pending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {error && !editing ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-black/8 px-6 py-4">
          <Button
            type="button"
            size="sm"
            className={cn(
              "bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90",
            )}
            disabled={pending}
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
