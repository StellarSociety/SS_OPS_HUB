"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { regenerateEmployeePayslip } from "@/lib/actions/hr-payroll";
import { cn } from "@/lib/utils";

export function PayslipRegenerateButton({
  runEmployeeId,
  tone = "light",
  disabled = false,
  onRegenerated,
}: {
  runEmployeeId: string;
  tone?: "light" | "dark";
  disabled?: boolean;
  /** Called with the new payslip id + version after a successful regenerate. */
  onRegenerated?: (next: {
    payslipId: string;
    version: number;
    unchanged: boolean;
  }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!info) return;
    const t = window.setTimeout(() => setInfo(null), 2500);
    return () => window.clearTimeout(t);
  }, [info]);

  function handleClick() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await regenerateEmployeePayslip(runEmployeeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRegenerated?.({
        payslipId: result.payslipId,
        version: result.version,
        unchanged: result.unchanged,
      });
      if (result.unchanged) {
        setInfo("No changes — version unchanged");
      } else {
        setInfo(`Updated to v${result.version}`);
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label="Update payslip version"
        title="Update payslip version"
        disabled={disabled || pending}
        onClick={handleClick}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md transition disabled:opacity-50",
          tone === "dark"
            ? "border border-white/20 bg-white/10 text-zinc-100 hover:bg-white/15"
            : "text-[var(--venue-primary,#818a40)] hover:bg-[var(--venue-primary,#818a40)]/10",
        )}
      >
        <RefreshCw
          className={cn("size-4", pending && "animate-spin")}
          strokeWidth={2}
        />
      </button>
      {error ? (
        <span
          className={
            tone === "dark"
              ? "max-w-[14rem] text-right text-xs text-red-300"
              : "max-w-[14rem] text-right text-xs text-red-700"
          }
        >
          {error}
        </span>
      ) : info ? (
        <span
          className={
            tone === "dark"
              ? "max-w-[14rem] text-right text-xs text-zinc-300"
              : "max-w-[14rem] text-right text-xs text-black/55"
          }
        >
          {info}
        </span>
      ) : null}
    </span>
  );
}
