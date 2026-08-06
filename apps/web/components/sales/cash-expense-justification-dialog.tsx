"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  buildCashExpenseDayRow,
  type CashExpenseJustificationLine,
} from "@/lib/sales/cash-expenses-calculations";
import { formatMoney, getWeekDayLabel } from "@/lib/sales/daily-sales-calculations";
import {
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_TOTALS_ROW_BG,
  salesTableNumericCellClass,
} from "@/lib/sales/sales-data-table-ui";
import { cn } from "@/lib/utils";

type CashExpenseJustificationDialogProps = {
  open: boolean;
  onClose: () => void;
  saleDate: string;
  cashExpensesGs: number;
  lines: CashExpenseJustificationLine[];
};

export function CashExpenseJustificationDialog({
  open,
  onClose,
  saleDate,
  cashExpensesGs,
  lines,
}: CashExpenseJustificationDialogProps) {
  const day = buildCashExpenseDayRow({
    saleDate,
    cashExpensesGs,
    lines,
  });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const weekDay = getWeekDayLabel(saleDate);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-expense-justification-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="cash-expense-justification-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {formatDisplayDate(saleDate)}{" "}
              <span className="text-base font-sans font-normal uppercase tracking-wide text-black/45">
                {weekDay}
              </span>
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Cash expenses {formatMoney(day.cashExpensesGs)} · Justified gross{" "}
              {formatMoney(day.justifiedGrossGs)} · To justify{" "}
              <span
                className={cn(
                  "font-medium",
                  day.justified ? "text-emerald-700" : "text-amber-800",
                )}
              >
                {formatMoney(day.toJustifyGs)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed border-black/15 px-3 py-8 text-center text-sm text-black/45">
              No expense references recorded for this day.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr
                    className={cn(
                      "border-b border-black/10 text-[11px] font-bold uppercase tracking-wide text-black/60",
                      SALES_TABLE_HEADER_COLUMN_BG,
                    )}
                  >
                    <th
                      className={cn(
                        "px-3 py-2.5 align-middle",
                        SALES_TABLE_CELL_BORDER,
                      )}
                    >
                      Description
                    </th>
                    <th
                      className={cn(
                        "w-[5.5rem] px-3 py-2.5 text-right align-middle",
                        SALES_TABLE_CELL_BORDER,
                      )}
                    >
                      Gross
                    </th>
                    <th
                      className={cn(
                        "w-[5.5rem] px-3 py-2.5 text-right align-middle",
                        SALES_TABLE_CELL_BORDER,
                      )}
                    >
                      VAT
                    </th>
                    <th
                      className={cn(
                        "w-[5.5rem] px-3 py-2.5 text-right align-middle",
                        SALES_TABLE_CELL_BORDER,
                      )}
                    >
                      Net
                    </th>
                    <th
                      className={cn(
                        "w-[6.5rem] px-3 py-2.5 text-center align-middle",
                        SALES_TABLE_CELL_BORDER,
                      )}
                    >
                      PChase Portal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr
                      key={line.id}
                      className="border-b border-black/5 last:border-b-0"
                    >
                      <td
                        className={cn(
                          "px-3 py-2 align-middle text-[#3D421F]",
                          SALES_TABLE_CELL_BORDER,
                        )}
                      >
                        {line.description.trim() || (
                          <span className="text-black/35">—</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                        )}
                      >
                        <span
                          className={cn(
                            salesTableNumericCellClass(false),
                            "inline-flex w-full justify-end",
                          )}
                        >
                          {formatMoney(line.grossGs)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                        )}
                      >
                        <span
                          className={cn(
                            salesTableNumericCellClass(false),
                            "inline-flex w-full justify-end",
                          )}
                        >
                          {formatMoney(line.vatGs)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                        )}
                      >
                        <span
                          className={cn(
                            salesTableNumericCellClass(false),
                            "inline-flex w-full justify-end",
                          )}
                        >
                          {formatMoney(line.netGs)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                        )}
                      >
                        <div className="flex justify-center">
                          {line.pchasePortal ? (
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-600/30 bg-emerald-50 text-emerald-700"
                              aria-label="In PChase Portal"
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </span>
                          ) : (
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded border border-black/15 bg-white text-black/25"
                              aria-label="Not in PChase Portal"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className={cn(
                      "border-t border-black/10 text-sm font-semibold text-[#3D421F]",
                      SALES_TABLE_TOTALS_ROW_BG,
                    )}
                  >
                    <td className={cn("px-3 py-2.5", SALES_TABLE_CELL_BORDER)}>
                      Total
                    </td>
                    <td className={cn("px-3 py-2.5", SALES_TABLE_CELL_BORDER)}>
                      <span
                        className={cn(
                          salesTableNumericCellClass(false),
                          "inline-flex w-full justify-end font-semibold",
                        )}
                      >
                        {formatMoney(day.justifiedGrossGs)}
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5", SALES_TABLE_CELL_BORDER)}>
                      <span
                        className={cn(
                          salesTableNumericCellClass(false),
                          "inline-flex w-full justify-end font-semibold",
                        )}
                      >
                        {formatMoney(day.justifiedVatGs)}
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5", SALES_TABLE_CELL_BORDER)}>
                      <span
                        className={cn(
                          salesTableNumericCellClass(false),
                          "inline-flex w-full justify-end font-semibold",
                        )}
                      >
                        {formatMoney(day.justifiedNetGs)}
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5", SALES_TABLE_CELL_BORDER)} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
