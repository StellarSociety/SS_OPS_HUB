"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  groupContiguousUnpaidRanges,
  unpaidLeaveLabelName,
  type FlightTicketEntitlement,
} from "@/lib/hr/benefits/flight-ticket";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { cn } from "@/lib/utils";

type FlightTicketUnpaidDaysDialogProps = {
  open: boolean;
  row: FlightTicketEntitlement | null;
  onClose: () => void;
};

function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function labelTone(code: string): string {
  const c = code.trim().toUpperCase();
  if (c === "ABS") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-amber-200 bg-amber-50 text-amber-950";
}

export function FlightTicketUnpaidDaysDialog({
  open,
  row,
  onClose,
}: FlightTicketUnpaidDaysDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !row) return null;

  const entries = row.unpaidLeaveEntries ?? [];
  const periods = groupContiguousUnpaidRanges(entries);
  const labelCountMap = new Map<string, number>();
  for (const entry of entries) {
    const code = entry.labelCode.trim().toUpperCase() || "UPL";
    labelCountMap.set(code, (labelCountMap.get(code) ?? 0) + 1);
  }
  const labelCounts = [...labelCountMap.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const dailyShare =
    row.calendarDays > 0 && row.ticketValuePerYear > 0
      ? row.ticketValuePerYear / row.calendarDays
      : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flight-ticket-unpaid-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="border-b border-black/10 px-5 py-4">
          <h2
            id="flight-ticket-unpaid-title"
            className="font-serif text-lg text-[#3D421F]"
          >
            Unpaid leave days
          </h2>
          <p className="mt-1 text-sm text-black/55">
            {row.fullName} · {row.empNo}
            {row.workYearStart && row.workYearEnd
              ? ` · ${formatDateOnly(row.workYearStart)} → ${formatDateOnly(row.workYearEnd)}`
              : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-black/10 bg-black/[0.03] px-2.5 py-1 text-black/65">
              Unpaid days{" "}
              <span className="font-semibold text-[#3D421F]">
                {row.unpaidLeaveDays}
              </span>
              {row.calendarDays
                ? ` / ${row.calendarDays} calendar`
                : null}
            </span>
            {labelCounts.map(([code, count]) => (
              <span
                key={code}
                className={cn(
                  "rounded-md border px-2.5 py-1 font-medium",
                  labelTone(code),
                )}
              >
                {code} · {count} · {unpaidLeaveLabelName(code)}
              </span>
            ))}
            {row.deductionAmount > 0 ? (
              <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-900">
                Ticket deduction{" "}
                <span className="font-semibold">
                  {formatAed(row.deductionAmount)}
                </span>
                {dailyShare > 0 ? (
                  <span className="font-normal opacity-80">
                    {" "}
                    ({formatAed(dailyShare)}/day)
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {periods.length === 0 ? (
            <p className="text-sm text-black/45">
              No day-level unpaid leave details available for this work year.
            </p>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                  Periods
                </h3>
                <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10">
                  {periods.map((period) => (
                    <li
                      key={`${period.start}:${period.end}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="tabular-nums text-[#3D421F]">
                          {period.start === period.end
                            ? formatDateOnly(period.start)
                            : `${formatDateOnly(period.start)} → ${formatDateOnly(period.end)}`}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1.5">
                          {period.labelCodes.map((code) => (
                            <span
                              key={code}
                              className={cn(
                                "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                labelTone(code),
                              )}
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-black/45">
                        {period.days} day{period.days === 1 ? "" : "s"}
                        {dailyShare > 0
                          ? ` · ${formatAed(dailyShare * period.days)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                  All days
                </h3>
                <div className="mt-2 overflow-hidden rounded-lg border border-black/10">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-[11px] font-semibold uppercase tracking-wide text-[#3D421F]">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Day</th>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Roster label</th>
                        {dailyShare > 0 ? (
                          <th className="px-3 py-2 text-right">Impact</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr
                          key={entry.date}
                          className="border-b border-black/5 last:border-b-0"
                        >
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#3D421F]">
                            {formatDateOnly(entry.date)}
                          </td>
                          <td className="px-3 py-2 text-black/55">
                            {weekdayShort(entry.date)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                labelTone(entry.labelCode),
                              )}
                            >
                              {entry.labelCode}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-black/70">
                            {unpaidLeaveLabelName(entry.labelCode)}
                          </td>
                          {dailyShare > 0 ? (
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-black/55">
                              −{formatAed(dailyShare)}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03]"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
