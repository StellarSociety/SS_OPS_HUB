"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getPayslipSnapshotAction } from "@/lib/actions/hr-payroll";
import { downloadPayslipPdfAsync } from "@/lib/hr/payslip-pdf";
import { payslipSnapshotToPdfInput } from "@/lib/hr/payslip-snapshot-to-pdf-input";

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
            await downloadPayslipPdfAsync(
              payslipSnapshotToPdfInput(result.snapshot),
              result.venueLogoUrl,
              result.venueStampUrl,
            );
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
