"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import { Input } from "@/components/ui/input";
import {
  listDeductionsForPayrollImport,
  type PayrollDeductionImportRow,
  type PayrollDeductionImportType,
} from "@/lib/actions/hr-payroll";
import { PAYROLL_DEDUCTION_IMPORT_SOURCES } from "@/lib/hr/payroll/pending-deduction-sources";
import { cn } from "@/lib/utils";

function formatMoney(amount: number, canViewSalary: boolean): string {
  if (!canViewSalary) return "•••";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatIssuedDate(iso: string): string {
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  try {
    return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return day;
  }
}

function statusBadgeClass(status: PayrollDeductionImportRow["status"]): string {
  switch (status) {
    case "on_this_run":
      return "bg-[var(--venue-secondary,#e8ebc8)] text-[#3D421F]";
    case "partial":
      return "bg-amber-50 text-amber-900";
    case "cleared":
      return "bg-black/5 text-black/50";
    default:
      return "bg-sky-50 text-sky-900";
  }
}

export function ImportDeductionsDialog({
  open,
  runId,
  canViewSalary,
  pending,
  onClose,
  onImport,
  onClearImported,
}: {
  open: boolean;
  runId: string;
  canViewSalary: boolean;
  pending: boolean;
  onClose: () => void;
  onImport: (input: {
    source: PayrollDeductionImportType;
    items: { deductionId: string; amount: number }[];
  }) => void;
  onClearImported: (input: { source: PayrollDeductionImportType }) => void;
}) {
  const [source, setSource] = useState<PayrollDeductionImportType>("all");
  const [rows, setRows] = useState<PayrollDeductionImportRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [applyAmounts, setApplyAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffQuery, setStaffQuery] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSource("all");
    setStaffQuery("");
    setLoadError(null);
    setBusyLabel(null);
  }, [open]);

  useEffect(() => {
    if (!pending) setBusyLabel(null);
  }, [pending]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void listDeductionsForPayrollImport({ runId, source }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setRows([]);
        setSelectedIds(new Set());
        setApplyAmounts({});
        setLoadError(result.error);
        return;
      }
      setRows(result.rows);
      const nextSelected = new Set<string>();
      const nextAmounts: Record<string, string> = {};
      for (const row of result.rows) {
        const defaultAmount =
          row.appliedOnThisRun > 0
            ? row.appliedOnThisRun
            : row.remainingAmount;
        nextAmounts[row.deductionId] = String(defaultAmount);
        if (row.alreadyApplied || row.remainingAmount > 0) {
          // Pre-select rows already on this run; leave others unchecked so HR
          // chooses what to deduct this month.
          if (row.alreadyApplied) nextSelected.add(row.deductionId);
        }
      }
      setSelectedIds(nextSelected);
      setApplyAmounts(nextAmounts);
    });
    return () => {
      cancelled = true;
    };
  }, [open, runId, source, reloadNonce]);

  const wasPending = useRef(false);
  useEffect(() => {
    if (!open) {
      wasPending.current = false;
      return;
    }
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      setReloadNonce((n) => n + 1);
    }
  }, [pending, open]);

  const filteredRows = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.empNo.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.sourceLabel.toLowerCase().includes(q) ||
        (r.departmentName?.toLowerCase().includes(q) ?? false) ||
        r.reason.toLowerCase().includes(q) ||
        r.statusLabel.toLowerCase().includes(q),
    );
  }, [rows, staffQuery]);

  const appliedCount = useMemo(
    () => rows.filter((r) => r.alreadyApplied).length,
    [rows],
  );

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const row of rows) {
      if (!selectedIds.has(row.deductionId)) continue;
      const raw = Number(applyAmounts[row.deductionId]);
      if (Number.isFinite(raw) && raw > 0) sum += raw;
    }
    return Math.round(sum * 100) / 100;
  }, [rows, selectedIds, applyAmounts]);

  const sourceMeta =
    source === "all"
      ? null
      : PAYROLL_DEDUCTION_IMPORT_SOURCES.find((s) => s.id === source);

  if (!open) return null;

  function selectAll() {
    setSelectedIds(new Set(filteredRows.map((r) => r.deductionId)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAmount(id: string, value: string, max: number) {
    const cleaned = value.replace(/[^\d.]/g, "");
    const num = Number(cleaned);
    if (cleaned === "" || !Number.isFinite(num)) {
      setApplyAmounts((prev) => ({ ...prev, [id]: cleaned }));
      return;
    }
    const capped = Math.min(Math.max(num, 0), max);
    setApplyAmounts((prev) => ({
      ...prev,
      [id]: cleaned.endsWith(".") ? cleaned : String(capped),
    }));
  }

  function handleClearImported() {
    const label =
      source === "all"
        ? "all imported deductions"
        : `imported ${sourceMeta?.label.toLowerCase() ?? "deductions"}`;
    if (
      !window.confirm(
        `Remove ${label} from this payroll? Outstanding balances return for later months. Net pay will be recalculated.`,
      )
    ) {
      return;
    }
    setLoadError(null);
    setBusyLabel("Removing deductions from this run…");
    onClearImported({ source });
  }

  function handleImport() {
    const items: { deductionId: string; amount: number }[] = [];
    for (const row of rows) {
      if (!selectedIds.has(row.deductionId)) continue;
      const amount = Math.round(Number(applyAmounts[row.deductionId]) * 100) / 100;
      if (!(amount > 0)) continue;
      if (amount > row.maxApplyAmount + 0.001) {
        setLoadError(
          `${row.fullName}: apply amount cannot exceed ${formatMoney(row.maxApplyAmount, true)}.`,
        );
        return;
      }
      items.push({ deductionId: row.deductionId, amount });
    }
    if (items.length === 0) {
      setLoadError("Select at least one deduction with an amount to apply.");
      return;
    }
    setLoadError(null);
    setBusyLabel(
      items.length === 1
        ? "Importing 1 deduction…"
        : `Importing ${items.length} deductions…`,
    );
    onImport({ source, items });
  }

  const isBusy = pending || loading;

  const emptyMessage =
    sourceMeta && !sourceMeta.available
      ? `${sourceMeta.label} deductions are not wired up yet. Uniform charges are available today.`
      : "No outstanding deductions for this filter. Charges stay listed until fully recovered.";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!isBusy && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-deductions-title"
        aria-busy={isBusy}
        className="flex max-h-[min(92vh,860px)] w-full max-w-6xl flex-col rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="border-b border-black/10 px-6 py-4">
          <h2
            id="import-deductions-title"
            className="font-serif text-xl text-[#3D421F]"
          >
            Import Deductions
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Choose how much of each outstanding charge to recover on this
            payroll. Any remainder stays visible on future runs until cleared.
            Uniform is live; other sources appear as those modules ship.
          </p>
        </div>

        <div
          className={cn(
            "relative min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4",
            pending && "pointer-events-none select-none",
          )}
        >
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <label
              htmlFor="import-deduction-source"
              className="text-[11px] font-medium uppercase tracking-wide text-black/45"
            >
              Source
            </label>
            <select
              id="import-deduction-source"
              value={source}
              disabled={isBusy}
              onChange={(e) =>
                setSource(e.target.value as PayrollDeductionImportType)
              }
              className="h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]"
            >
              <option value="all">All sources</option>
              {PAYROLL_DEDUCTION_IMPORT_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.available ? "" : " (soon)"}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              value={staffQuery}
              disabled={isBusy}
              onChange={(e) => setStaffQuery(e.target.value)}
              placeholder="Search employees…"
              className="h-9 max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isBusy || filteredRows.length === 0}
                onClick={selectAll}
                className="h-8 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                disabled={isBusy || selectedIds.size === 0}
                onClick={selectNone}
                className="h-8 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
              >
                Select none
              </button>
            </div>
          </div>

          {appliedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#e8ebc8)]/35 px-3 py-2">
              <p className="mr-auto text-xs text-[#3D421F]/80">
                {appliedCount} already on this payroll
              </p>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleClearImported}
                className="h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {pending && busyLabel?.startsWith("Removing")
                  ? "Removing…"
                  : "Remove from this run"}
              </button>
            </div>
          ) : null}

          {loadError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {loadError}
            </p>
          ) : null}

          {loading ? (
            <SalesImportProgressBar label="Loading outstanding deductions…" />
          ) : (
            <div
              className={cn(
                "max-h-[min(52vh,480px)] overflow-auto rounded-lg border border-black/10",
                pending && "opacity-60",
              )}
            >
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#f7f8f0] text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="px-3 py-2.5 font-medium"> </th>
                    <th className="px-3 py-2.5 font-medium">Issued</th>
                    <th className="px-3 py-2.5 font-medium">Emp no</th>
                    <th className="px-3 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Source</th>
                    <th className="px-3 py-2.5 font-medium">Detail</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Original
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Remaining
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Apply this run
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-3 py-8 text-center text-sm text-black/45"
                      >
                        {emptyMessage}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const selected = selectedIds.has(row.deductionId);
                      return (
                        <tr
                          key={row.deductionId}
                          className={cn(
                            "hover:bg-black/[0.02]",
                            selected && "bg-[var(--venue-secondary,#F0F3DD)]/25",
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={pending || row.maxApplyAmount <= 0}
                              onChange={() => toggleOne(row.deductionId)}
                              className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
                              aria-label={`Import ${row.fullName}`}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-black/60">
                            {formatIssuedDate(row.createdAt)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs">
                            {row.empNo}
                          </td>
                          <td className="px-3 py-2.5 text-[#3D421F]">
                            <span className="block font-medium">
                              {row.fullName}
                            </span>
                            {row.departmentName ? (
                              <span className="block text-xs text-black/45">
                                {row.departmentName}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-black/60">
                            {row.sourceLabel}
                          </td>
                          <td className="max-w-[14rem] px-3 py-2.5 text-black/55">
                            <span className="line-clamp-2">
                              {row.reason || row.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                statusBadgeClass(row.status),
                              )}
                            >
                              {row.statusLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-black/65">
                            {formatMoney(row.originalAmount, canViewSalary)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#3D421F]">
                            {formatMoney(row.remainingAmount, canViewSalary)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={row.maxApplyAmount}
                              step="0.01"
                              disabled={pending || !selected}
                              value={applyAmounts[row.deductionId] ?? ""}
                              onChange={(e) =>
                                setAmount(
                                  row.deductionId,
                                  e.target.value,
                                  row.maxApplyAmount,
                                )
                              }
                              className="ml-auto h-8 w-[7.5rem] text-right tabular-nums"
                              aria-label={`Amount to apply for ${row.fullName}`}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-black/50">
            {selectedIds.size} selected · apply{" "}
            {formatMoney(selectedTotal, canViewSalary)} on this run
          </p>
        </div>

        {pending ? (
          <div className="border-t border-black/10 px-6 py-3">
            <SalesImportProgressBar
              label={busyLabel ?? "Working on deductions…"}
            />
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-black/10 px-6 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              isBusy || (selectedIds.size === 0 && appliedCount === 0)
            }
            onClick={handleImport}
            className={cn(
              "h-9 rounded-md bg-[var(--venue-primary,#818a40)] px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50",
            )}
          >
            {pending && busyLabel?.startsWith("Importing")
              ? "Importing…"
              : "Import selected"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
