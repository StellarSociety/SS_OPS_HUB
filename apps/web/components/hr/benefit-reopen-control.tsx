"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reopenBenefitRun } from "@/lib/actions/hr-benefits";
import type { BenefitKind } from "@/lib/hr/benefits";

export function BenefitReopenControl({
  kind,
  runId,
  appliedToPayroll,
  appearance,
}: {
  kind: BenefitKind;
  runId: string;
  appliedToPayroll: boolean;
  appearance: "link" | "button";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        setOpen(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await reopenBenefitRun(kind, runId);
      if (!result.ok) {
        setError(result.error ?? "Could not reopen this run.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {appearance === "button" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Reopen
        </Button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="text-sm font-medium text-rose-800 underline-offset-2 hover:underline disabled:opacity-50"
        >
          Reopen
        </button>
      )}
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
              role="presentation"
              onMouseDown={(event) => {
                if (!pending && event.target === event.currentTarget) {
                  setOpen(false);
                  setError(null);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`reopen-benefit-run-${runId}`}
                className="w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
                  <div>
                    <h2
                      id={`reopen-benefit-run-${runId}`}
                      className="font-serif text-xl text-[#3D421F]"
                    >
                      Reopen for alterations
                    </h2>
                    <p className="mt-1 text-sm text-black/55">
                      {appliedToPayroll
                        ? "This run was sent to payroll. Reopening lets you change allocations; finalize again when you are done. Amounts already on a payroll run drop the next time that payroll is recalculated unless you re-import."
                        : "Reopen this run so you can change allocations. Payroll will not pick it up until you finalize again."}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setOpen(false);
                      setError(null);
                    }}
                    className="rounded-md p-1 text-black/40 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {error ? (
                  <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-800">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      setOpen(false);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    className="bg-rose-700 text-white hover:bg-rose-800 hover:opacity-100"
                    onClick={confirm}
                  >
                    {pending ? "Reopening…" : "Confirm reopen"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
