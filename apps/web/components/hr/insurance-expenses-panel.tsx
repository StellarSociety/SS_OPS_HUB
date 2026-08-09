"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Download, X } from "lucide-react";
import { InsuranceEmployeeEditDialog } from "@/components/hr/insurance-employee-edit-dialog";
import { InsuranceExpensesExportDialog } from "@/components/hr/insurance-expenses-export-dialog";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { Button } from "@/components/ui/button";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import type {
  InsuranceCategoryWithDefaults,
  InsuranceEmployeeRow,
  InsuranceExpenseLine,
  InsuranceExpenseMonth,
} from "@/lib/hr/types";

type InsuranceExpensesPanelProps = {
  months: InsuranceExpenseMonth[];
  employeeRows: InsuranceEmployeeRow[];
  categories: InsuranceCategoryWithDefaults[];
  canManage?: boolean;
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
};

type StaffPopup = {
  monthLabel: string;
  line: InsuranceExpenseLine;
};

function moneyCell(amount: number): string {
  return formatAed(amount);
}

export function InsuranceExpensesPanel({
  months,
  employeeRows,
  categories,
  canManage = false,
  venueName,
  venueLogoUrl = null,
  userDisplayName,
}: InsuranceExpensesPanelProps) {
  const router = useRouter();
  const years = useMemo(() => {
    const set = new Set(months.map((m) => m.monthKey.slice(0, 4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [months]);

  const [yearFilter, setYearFilter] = useState<string>("all");
  const [staffPopup, setStaffPopup] = useState<StaffPopup | null>(null);
  const [editRow, setEditRow] = useState<InsuranceEmployeeRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const employeesById = useMemo(() => {
    const map = new Map<string, InsuranceEmployeeRow>();
    for (const row of employeeRows) {
      map.set(row.staff.id, row);
    }
    return map;
  }, [employeeRows]);

  useEffect(() => {
    if (!staffPopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editRow) return;
        setStaffPopup(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [staffPopup, editRow]);

  const filtered = useMemo(() => {
    const list =
      yearFilter === "all"
        ? months
        : months.filter((m) => m.monthKey.startsWith(yearFilter));
    return [...list].sort((a, b) =>
      a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
    );
  }, [months, yearFilter]);

  const grand = useMemo(() => {
    return filtered.reduce(
      (acc, m) => ({
        count: acc.count + m.totalCount,
        net: acc.net + m.totalNet,
        vat: acc.vat + m.totalVat,
        gross: acc.gross + m.totalGross,
      }),
      { count: 0, net: 0, vat: 0, gross: 0 },
    );
  }, [filtered]);

  function openEmployeeInsurance(staffId: string) {
    if (!canManage) return;
    const row = employeesById.get(staffId);
    if (!row) return;
    setEditRow(row);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-nav text-base font-semibold text-[#3D421F]">
            Insurance expenses
          </h2>
          <p className="mt-1 text-sm text-black/50">
            Costs by insurance issue date — Net, VAT, and Gross per category
            each month.
          </p>
        </div>
        {years.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-[#3D421F]">
              <span className="text-black/45">Year</span>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
              >
                <option value="all">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              className="h-10 gap-2 bg-[var(--venue-primary,#818a40)] px-3 text-white hover:opacity-90"
              disabled={months.length === 0}
              onClick={() => setExportOpen(true)}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <p className="text-center text-sm text-muted-foreground">
            No insurance expenses found
            {yearFilter !== "all" ? ` for ${yearFilter}` : ""}. Issue dates on
            employee insurance records drive this report.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/45">
                  <th className="sticky top-0 z-[1] bg-black/[0.03] px-4 py-3 font-medium">
                    Month
                  </th>
                  <th className="sticky top-0 z-[1] bg-black/[0.03] px-4 py-3 font-medium">
                    Category
                  </th>
                  <th className="sticky top-0 z-[1] bg-black/[0.03] px-4 py-3 text-right font-medium">
                    Qty
                  </th>
                  <th className="sticky top-0 z-[1] bg-black/[0.03] px-4 py-3 text-right font-medium">
                    Net
                  </th>
                  <th className="sticky top-0 z-[1] bg-black/[0.03] px-4 py-3 text-right font-medium">
                    VAT
                  </th>
                  <th className="sticky top-0 z-[1] bg-black/[0.03] px-4 py-3 text-right font-medium">
                    Gross
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((month) => (
                  <Fragment key={month.monthKey}>
                    {month.lines.map((line, lineIndex) => (
                      <tr
                        key={`${month.monthKey}-${line.categoryKey}`}
                        className="border-b border-black/5"
                      >
                        {lineIndex === 0 ? (
                          <td
                            rowSpan={month.lines.length}
                            className="border-r border-black/5 bg-black/[0.015] px-4 py-2.5 align-top font-medium text-[#3D421F]"
                          >
                            {month.label}
                          </td>
                        ) : null}
                        <td className="px-4 py-2.5 text-[#3D421F]">
                          <span className="font-medium">{line.name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <button
                            type="button"
                            onClick={() =>
                              setStaffPopup({
                                monthLabel: month.label,
                                line,
                              })
                            }
                            className="font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 transition hover:underline"
                            title={`View ${line.count} employee${line.count === 1 ? "" : "s"}`}
                          >
                            {line.count}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#3D421F]">
                          {moneyCell(line.net)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#3D421F]">
                          {moneyCell(line.vat)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[#3D421F]">
                          {moneyCell(line.gross)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-secondary,#F0F3DD)]/55">
                  <td
                    colSpan={2}
                    className="px-4 py-3.5 text-sm font-semibold text-[#3D421F]"
                  >
                    {yearFilter === "all"
                      ? "Grand total"
                      : `Total ${yearFilter}`}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-[#3D421F]">
                    {grand.count}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-[#3D421F]">
                    {moneyCell(grand.net)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-[#3D421F]">
                    {moneyCell(grand.vat)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-[#3D421F]">
                    {moneyCell(grand.gross)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {staffPopup && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setStaffPopup(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="insurance-expense-staff-title"
                className="flex max-h-[min(90vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
                  <div className="min-w-0">
                    <h2
                      id="insurance-expense-staff-title"
                      className="font-nav text-base font-semibold text-[#3D421F]"
                    >
                      {staffPopup.line.name}
                    </h2>
                    <p className="mt-1 text-sm text-black/50">
                      {staffPopup.monthLabel} · {staffPopup.line.count}{" "}
                      {staffPopup.line.count === 1 ? "policy" : "policies"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
                    onClick={() => setStaffPopup(null)}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
                  {staffPopup.line.staff.map((person, index) => {
                    const canOpen =
                      canManage && employeesById.has(person.staffId);
                    return (
                      <li
                        key={`${person.staffId}-${person.issuedAt}-${person.reference}-${index}`}
                      >
                        <div
                          role={canOpen ? "button" : undefined}
                          tabIndex={canOpen ? 0 : undefined}
                          onClick={() => {
                            if (canOpen) openEmployeeInsurance(person.staffId);
                          }}
                          onKeyDown={(e) => {
                            if (!canOpen) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openEmployeeInsurance(person.staffId);
                            }
                          }}
                          className={
                            canOpen
                              ? "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.03]"
                              : "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
                          }
                          title={
                            canOpen
                              ? `Open insurance for ${person.fullName}`
                              : undefined
                          }
                        >
                          <StaffPhotoThumbnail
                            fullName={person.fullName}
                            photoUrl={person.photoUrl}
                            empNo={person.empNo}
                            department={person.departmentName}
                            position={person.positionName}
                            employeeStatus={person.employmentStatusName}
                            workingStatus={person.workingStatusName}
                            nationality={person.nationalityName}
                            dob={person.dob}
                            joiningDate={person.joiningDate}
                            terminationDate={person.terminationDate}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#3D421F]">
                              {person.fullName}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-black/45">
                              <StaffDirectoryLink
                                staffId={person.staffId}
                                empNo={person.empNo}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span aria-hidden>·</span>
                              <span>
                                Issued {formatDateOnly(person.issuedAt)}
                              </span>
                              {person.reference ? (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="truncate">
                                    {person.reference}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <div className="shrink-0 text-right text-xs tabular-nums text-[#3D421F]">
                            {formatAed(person.value)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex justify-end border-t border-black/10 px-5 py-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                    onClick={() => setStaffPopup(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <InsuranceEmployeeEditDialog
        row={editRow}
        categories={categories}
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
        onSaved={() => router.refresh()}
      />

      <InsuranceExpensesExportDialog
        open={exportOpen}
        months={filtered.length > 0 ? filtered : months}
        venueName={venueName}
        venueLogoUrl={venueLogoUrl}
        userDisplayName={userDisplayName}
        initialMonthKey={filtered[0]?.monthKey}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
