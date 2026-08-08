"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  flightTicketStatusLabel,
  type FlightTicketEntitlement,
} from "@/lib/hr/benefits/flight-ticket";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { cn } from "@/lib/utils";

type FlightTicketPrepareDialogProps = {
  open: boolean;
  rows: FlightTicketEntitlement[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (staffIds: string[]) => void;
};

function payrollMonthLabel(monthKey: string | null): string {
  if (!monthKey || !/^\d{4}-\d{2}/.test(monthKey)) return "—";
  const [y, m] = monthKey.slice(0, 7).split("-").map(Number);
  if (!y || !m) return "—";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusTone(status: FlightTicketEntitlement["status"]): string {
  switch (status) {
    case "due":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-950";
    default:
      return "border-black/10 bg-black/[0.03] text-black/55";
  }
}

export function isFlightTicketPrepareCandidate(
  row: FlightTicketEntitlement,
): boolean {
  return (
    (row.status === "due" || row.status === "pending") && row.payableAmount > 0
  );
}

export function FlightTicketPrepareDialog({
  open,
  rows,
  pending,
  onClose,
  onConfirm,
}: FlightTicketPrepareDialogProps) {
  const candidates = useMemo(
    () => rows.filter(isFlightTicketPrepareCandidate),
    [rows],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(candidates.map((r) => r.staffId)));
    setError(null);
  }, [open, candidates]);

  const groups = useMemo(() => {
    const map = new Map<string, FlightTicketEntitlement[]>();
    for (const row of candidates) {
      const key = row.payrollMonth ?? "__none__";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, monthRows]) => ({
        monthKey,
        rows: monthRows.sort((x, y) =>
          (x.joiningDate ?? "").localeCompare(y.joiningDate ?? ""),
        ),
        payable: monthRows.reduce((sum, r) => sum + r.payableAmount, 0),
      }));
  }, [candidates]);

  const selectedRows = candidates.filter((r) => selectedIds.has(r.staffId));
  const selectedTotal = selectedRows.reduce(
    (sum, r) => sum + r.payableAmount,
    0,
  );

  if (!open) return null;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(candidates.map((r) => r.staffId)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  function handleConfirm() {
    if (selectedIds.size === 0) {
      setError("Select at least one employee to prepare for payroll import.");
      return;
    }
    setError(null);
    onConfirm([...selectedIds]);
  }

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
        aria-labelledby="flight-ticket-prepare-title"
        aria-busy={pending}
        className="flex max-h-[min(92vh,820px)] w-full max-w-4xl flex-col rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="border-b border-black/10 px-6 py-4">
          <h2
            id="flight-ticket-prepare-title"
            className="font-serif text-xl text-[#3D421F]"
          >
            Prepare flight tickets for payroll
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Review Due (this month) and Pending (carried from earlier months).
            Unticked employees stay Pending and appear again next month.
          </p>
        </div>

        <div
          className={cn(
            "relative min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4",
            pending && "pointer-events-none select-none opacity-70",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03]"
              >
                Clear
              </button>
            </div>
            <p className="text-xs text-black/55">
              Selected {selectedRows.length} · {formatAed(selectedTotal)}
            </p>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {candidates.length === 0 ? (
            <p className="rounded-lg border border-black/10 bg-black/[0.02] px-4 py-8 text-center text-sm text-black/45">
              No Due or Pending flight tickets with a payable amount.
            </p>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={group.monthKey} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-serif text-base text-[#3D421F]">
                      {payrollMonthLabel(group.monthKey)}
                    </h3>
                    <p className="text-xs text-black/45">
                      {group.rows.length} employee
                      {group.rows.length === 1 ? "" : "s"} ·{" "}
                      {formatAed(group.payable)}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-black/10">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-[11px] font-semibold uppercase tracking-wide text-[#3D421F]">
                          <th className="w-10 px-3 py-2" />
                          <th className="px-3 py-2">Employee</th>
                          <th className="px-3 py-2">Anniversary</th>
                          <th className="px-3 py-2 text-right">Payable</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => {
                          const checked = selectedIds.has(row.staffId);
                          return (
                            <tr
                              key={row.staffId}
                              className="border-b border-black/5 last:border-b-0"
                            >
                              <td className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(row.staffId)}
                                  className="h-4 w-4 rounded border-black/20"
                                  aria-label={`Include ${row.fullName}`}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-[#3D421F]">
                                  {row.fullName}
                                </div>
                                <div className="text-xs text-black/45">
                                  {row.empNo}
                                  {row.departmentName
                                    ? ` · ${row.departmentName}`
                                    : ""}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-black/70">
                                {row.anniversaryDate
                                  ? formatDateOnly(row.anniversaryDate)
                                  : "—"}
                                {row.yearsCompleted > 0 ? (
                                  <div className="text-xs text-black/45">
                                    Year {row.yearsCompleted}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium tabular-nums text-[#3D421F]">
                                {formatAed(row.payableAmount)}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                    statusTone(row.status),
                                  )}
                                >
                                  {flightTicketStatusLabel(
                                    row.status,
                                    row.contractKind,
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 px-6 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || selectedIds.size === 0}
            onClick={handleConfirm}
            className="rounded-md bg-[var(--venue-primary,#818a40)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? "Preparing…"
              : `Prepare ${selectedRows.length || ""} for import`.trim()}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
