"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PayslipViewButton } from "@/components/hr/payslip-view-button";
import {
  listStaffMonthlyPayslips,
  type StaffMonthlyPayslipItem,
} from "@/lib/actions/hr-payroll";
import { formatAed } from "@/lib/hr/derived";
import { cn } from "@/lib/utils";

type StaffEmploymentPathPayProps = {
  staffId?: string | null;
  canViewSalary?: boolean;
};

export function StaffEmploymentPathPay({
  staffId = null,
  canViewSalary = false,
}: StaffEmploymentPathPayProps) {
  const [items, setItems] = useState<StaffMonthlyPayslipItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!staffId || !canViewSalary) {
      setItems([]);
      setError(null);
      return;
    }

    let cancelled = false;
    startTransition(async () => {
      const result = await listStaffMonthlyPayslips(staffId);
      if (cancelled) return;
      if (!result.ok) {
        setItems([]);
        setError(result.error);
        return;
      }
      setError(null);
      setItems(result.items);
    });

    return () => {
      cancelled = true;
    };
  }, [staffId, canViewSalary]);

  if (!staffId) {
    return (
      <Card className="space-y-2 p-5">
        <h3 className="font-serif text-lg text-[#3D421F]">Pay history</h3>
        <p className="text-sm text-black/50">
          Save this employee first to see monthly net income and payslips.
        </p>
      </Card>
    );
  }

  if (!canViewSalary) {
    return (
      <Card className="space-y-2 p-5">
        <h3 className="font-serif text-lg text-[#3D421F]">Pay history</h3>
        <p className="text-sm text-black/50">
          You do not have permission to view salary or pay history.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <h3 className="font-serif text-lg text-[#3D421F]">Pay history</h3>
        <p className="text-sm leading-relaxed text-black/50">
          Monthly net income from the latest payslip for each month. Open a
          payslip to review the full breakdown.
        </p>
      </div>

      {pending && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-black/50">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading pay history…
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!pending && !error && items.length === 0 ? (
        <p className="text-sm text-black/45">No payslips on file yet.</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-black/5 overflow-hidden rounded-lg border border-black/8">
          {items.map((row) => (
            <li
              key={row.payslipId}
              className="flex items-center gap-3 bg-white/70 px-3 py-2.5 sm:px-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[#3D421F]">
                  {row.payrollMonthLabel}
                </p>
                <p className="text-xs text-black/40">
                  Latest payslip
                  {row.version > 1 ? ` · v${row.version}` : ""}
                </p>
              </div>
              <p
                className={cn(
                  "shrink-0 text-right text-sm font-semibold tabular-nums text-[#3D421F]",
                )}
              >
                {formatAed(row.netSalary)}
              </p>
              <PayslipViewButton
                payslipId={row.payslipId}
                label="View"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
