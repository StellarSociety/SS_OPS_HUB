"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import { recalculatePayrollRun } from "@/lib/actions/hr-payroll";
import { canEditPayrollRun } from "@/lib/hr/payroll";
import { getRegisteredPayrollRunSave } from "@/components/hr/payroll-run-save-registry";

export function PayrollRunSaveButton({
  runId,
  runStatus,
  canEdit,
}: {
  runId: string;
  runStatus: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const editable = canEdit && canEditPayrollRun(runStatus);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(id);
  }, [message]);

  if (!editable) return null;

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      try {
        const registered = getRegisteredPayrollRunSave();
        if (registered) {
          await registered();
        } else {
          const result = await recalculatePayrollRun(runId);
          if (!result.ok) {
            setMessage(result.error ?? "Save failed");
            return;
          }
        }
        setMessage("Saved");
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {message ? (
          <span className={cnMessage(message)} role="status">
            {message}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={handleSave}
          className="h-8 gap-1.5 bg-[var(--venue-primary,#818a40)] px-3 text-xs font-semibold text-white hover:opacity-90"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {pending ? (
        <div className="basis-full pt-1">
          <SalesImportProgressBar label="Saving payroll…" />
        </div>
      ) : null}
    </>
  );
}

function cnMessage(message: string): string {
  const failed = /fail|error|must|invalid|permission|locked/i.test(message);
  return failed
    ? "text-xs font-medium text-red-700"
    : "text-xs font-medium text-[var(--venue-primary,#818a40)]";
}
