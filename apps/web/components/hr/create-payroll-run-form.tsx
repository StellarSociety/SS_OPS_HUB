"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { PayrollMonthPicker } from "@/components/hr/payroll-month-picker";
import { Button } from "@/components/ui/button";
import { createPayrollRun } from "@/lib/actions/hr-payroll";
import { toScopedHref } from "@/lib/venue/scope-routing";

export function CreatePayrollRunForm({
  canEdit,
  periodStartDay,
  periodEndDay,
}: {
  canEdit: boolean;
  periodStartDay?: number;
  periodEndDay?: number;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-black/5 bg-white/60 p-4 shadow-sm backdrop-blur-xl"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            const result = await createPayrollRun(month);
            if ("error" in result && result.error) {
              setError(result.error);
              return;
            }
            if ("id" in result) {
              router.push(
                toScopedHref(`/hr/payroll/${result.id}?tab=run`, scope, slug),
              );
              router.refresh();
            }
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Could not create payroll run",
            );
          }
        });
      }}
    >
      <PayrollMonthPicker
        id="payroll_month"
        value={month}
        onChange={setMonth}
        periodStartDay={periodStartDay}
        periodEndDay={periodEndDay}
        disabled={pending}
      />
      <Button type="submit" size="sm" className="h-10" disabled={pending || !month}>
        {pending ? "Creating…" : "Create payroll run"}
      </Button>
      {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
