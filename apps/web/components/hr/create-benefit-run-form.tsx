"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { PayrollMonthPicker } from "@/components/hr/payroll-month-picker";
import { Button } from "@/components/ui/button";
import { createBenefitRun } from "@/lib/actions/hr-benefits";
import type { BenefitKind } from "@/lib/hr/benefits";
import { toScopedHref } from "@/lib/venue/scope-routing";

const KIND_META: Record<
  BenefitKind,
  { label: string; monthLabel: string; hrefBase: string }
> = {
  gratuity: {
    label: "Create gratuity run",
    monthLabel: "Tips month",
    hrefBase: "/hr/benefits/gratuity",
  },
  service_charge: {
    label: "Create service charge run",
    monthLabel: "Service charge month",
    hrefBase: "/hr/benefits/service-charge",
  },
};

export function CreateBenefitRunForm({
  kind,
  canEdit,
  periodStartDay,
  periodEndDay,
}: {
  kind: BenefitKind;
  canEdit: boolean;
  periodStartDay?: number;
  periodEndDay?: number;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const meta = KIND_META[kind];
  const [month, setMonth] = useState(() => {
    const now = new Date();
    // Default to previous calendar month (tips distribute mid-month for prior month).
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            const result = await createBenefitRun(kind, month);
            if ("error" in result && result.error) {
              setError(result.error);
              return;
            }
            if ("id" in result) {
              router.push(
                toScopedHref(`${meta.hrefBase}/${result.id}`, scope, slug),
              );
              router.refresh();
            }
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not create benefit run",
            );
          }
        });
      }}
    >
      <PayrollMonthPicker
        id={`${kind}_month`}
        label={meta.monthLabel}
        value={month}
        onChange={setMonth}
        periodStartDay={periodStartDay}
        periodEndDay={periodEndDay}
        disabled={pending}
      />
      <Button type="submit" size="sm" className="h-10" disabled={pending || !month}>
        {pending ? "Creating…" : meta.label}
      </Button>
      {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
