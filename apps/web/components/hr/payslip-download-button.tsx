"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getPayslipSnapshotAction } from "@/lib/actions/hr-payroll";
import { downloadPayslipPdf } from "@/lib/hr/payslip-pdf";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll";

export function PayslipDownloadButton({
  payslipId,
  label = "PDF",
}: {
  payslipId: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto px-0 text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:bg-transparent hover:underline"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await getPayslipSnapshotAction(payslipId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            const s = result.snapshot;
            downloadPayslipPdf({
              venueName: s.employer.venueName,
              payrollMonthLabel: formatPayrollMonthLabel(s.payrollMonth),
              periodStart: s.periodStart,
              periodEnd: s.periodEnd,
              paymentDate: s.paymentDate,
              empNo: s.employee.empNo,
              fullName: s.employee.fullName,
              departmentName: s.employee.department,
              positionName: s.employee.position,
              paidDays: Number(s.paidDays),
              unpaidDays: Number(s.unpaidDays),
              version: s.version,
              lines: [
                ...s.fixed.map((l) => ({
                  category: "Fixed",
                  label: l.label,
                  amount: Number(l.amount),
                })),
                ...s.variables.map((l) => ({
                  category: "Variable",
                  label: l.label,
                  amount: Number(l.amount),
                })),
                ...s.deductions.map((l) => ({
                  category: "Deduction",
                  label: l.label,
                  amount: Number(l.amount),
                })),
              ],
              grossEarnings: Number(s.grossEarnings),
              totalDeductions: Number(s.totalDeductions),
              netSalary: Number(s.netSalary),
            });
          });
        }}
      >
        {pending ? "…" : label}
      </Button>
      {error ? (
        <span className="max-w-[12rem] text-right text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
