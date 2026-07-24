"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPayrollRun } from "@/lib/actions/hr-payroll";
import { toScopedHref } from "@/lib/venue/scope-routing";

export function CreatePayrollRunForm({ canEdit }: { canEdit: boolean }) {
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
      className="flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm"
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
      <div className="space-y-1.5">
        <Label htmlFor="payroll_month">Payroll month</Label>
        <Input
          id="payroll_month"
          type="month"
          className="h-8 w-44"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={pending || !month}>
        {pending ? "Creating…" : "Create payroll run"}
      </Button>
      {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
