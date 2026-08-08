"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import {
  listStaffVisaEmployeePenaltyDeductions,
  type VisaEmployeePenaltyDeductionLine,
} from "@/lib/actions/hr-visa";
import { formatAed } from "@/lib/hr/derived";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll";
import type { VisaEmployeeRow } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type VisaPenaltyDeductionsDialogProps = {
  open: boolean;
  row: VisaEmployeeRow | null;
  onClose: () => void;
};

function statusLabel(status: VisaEmployeePenaltyDeductionLine["status"]): string {
  switch (status) {
    case "applied":
      return "Fully applied";
    case "cleared":
      return "Cleared";
    case "pending":
      return "Pending payroll";
    case "cancelled":
      return "Cancelled";
    case "unqueued":
      return "Not queued yet";
    default:
      return status;
  }
}

function statusClass(status: VisaEmployeePenaltyDeductionLine["status"]): string {
  switch (status) {
    case "applied":
    case "cleared":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "unqueued":
      return "border-black/10 bg-black/[0.03] text-black/55";
    default:
      return "border-black/10 bg-white text-black/60";
  }
}

function monthLabel(iso: string | null): string {
  if (!iso) return "Unknown payroll";
  try {
    return formatPayrollMonthLabel(iso);
  } catch {
    return iso.slice(0, 7);
  }
}

export function VisaPenaltyDeductionsDialog({
  open,
  row,
  onClose,
}: VisaPenaltyDeductionsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<VisaEmployeePenaltyDeductionLine[]>([]);
  const [totalAbsorbed, setTotalAbsorbed] = useState(0);
  const [totalDeducted, setTotalDeducted] = useState(0);
  const [totalRemaining, setTotalRemaining] = useState(0);

  useEffect(() => {
    if (!open || !row) return;
    setLoading(true);
    setError(null);
    setLines([]);
    let cancelled = false;
    void listStaffVisaEmployeePenaltyDeductions({ staffId: row.staff.id }).then(
      (result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setLines(result.lines);
        setTotalAbsorbed(result.totalEmployeeAbsorbed);
        setTotalDeducted(result.totalDeducted);
        setTotalRemaining(result.totalRemaining);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !row || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visa-penalty-deductions-title"
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="visa-penalty-deductions-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              Employee penalty deductions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.staff.full_name}
              {row.staff.emp_no ? ` · ${row.staff.emp_no}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-black/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading deduction history…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-black/45">
              No employee-absorbed visa penalties on file.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 p-3 text-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                    Absorbed
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#3D421F]">
                    {formatAed(totalAbsorbed)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                    Deducted
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-800">
                    {formatAed(totalDeducted)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                    Remaining
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-800">
                    {formatAed(totalRemaining)}
                  </p>
                </div>
              </div>

              <ul className="space-y-3">
                {lines.map((line) => (
                  <li
                    key={line.penaltyId}
                    className="rounded-xl border border-black/10 bg-white p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#3D421F]">
                          {line.description}
                        </p>
                        {line.visaNumber ? (
                          <p className="mt-0.5 text-xs text-black/45">
                            Visa {line.visaNumber}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-[#3D421F]">
                          {formatAed(line.amount)}
                        </p>
                        <span
                          className={cn(
                            "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            statusClass(line.status),
                          )}
                        >
                          {statusLabel(line.status)}
                        </span>
                      </div>
                    </div>

                    {line.applications.length > 0 ? (
                      <div className="mt-3 space-y-1.5 border-t border-black/5 pt-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                          Applied on payroll
                        </p>
                        <ul className="space-y-1">
                          {line.applications.map((app) => (
                            <li
                              key={`${app.runId}-${app.amount}`}
                              className="flex items-center justify-between gap-2 text-xs text-[#3D421F]"
                            >
                              <span>
                                {monthLabel(app.payrollMonth)}
                                {app.runStatus ? (
                                  <span className="ml-1.5 text-black/40">
                                    · {app.runStatus.replace(/_/g, " ")}
                                  </span>
                                ) : null}
                              </span>
                              <span className="font-medium tabular-nums text-emerald-800">
                                {formatAed(app.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-black/40">
                        {line.status === "pending"
                          ? "Queued for payroll → Import Deductions (Visa runs). Not applied to a payroll yet."
                          : line.status === "unqueued"
                            ? "Save the visa record to queue this charge for payroll import."
                            : "No payroll applications recorded."}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
