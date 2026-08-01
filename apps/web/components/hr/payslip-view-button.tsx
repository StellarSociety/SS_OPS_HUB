"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPayslipSnapshotAction } from "@/lib/actions/hr-payroll";
import { buildPayslipPdfDataUriAsync } from "@/lib/hr/payslip-pdf";
import { payslipSnapshotToPdfInput } from "@/lib/hr/payslip-snapshot-to-pdf-input";

function dataUriToObjectUrl(dataUri: string): string {
  const comma = dataUri.indexOf(",");
  const meta = comma >= 0 ? dataUri.slice(0, comma) : "";
  const payload = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
  const isBase64 = /;base64/i.test(meta);
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export function PayslipViewButton({ payslipId }: { payslipId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Payslip");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function close() {
    setOpen(false);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setError(null);
  }

  function handleView() {
    setError(null);
    startTransition(async () => {
      const result = await getPayslipSnapshotAction(payslipId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const input = payslipSnapshotToPdfInput(result.snapshot);
      setTitle(
        `${input.fullName || "Payslip"} · ${input.payrollMonthLabel}${
          input.version ? ` · v${input.version}` : ""
        }`,
      );
      try {
        const dataUri = await buildPayslipPdfDataUriAsync(
          input,
          result.venueLogoUrl,
          result.venueStampUrl,
        );
        const url = dataUriToObjectUrl(dataUri);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
        setOpen(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not render payslip.",
        );
      }
    });
  }

  return (
    <>
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          aria-label="View payslip"
          title="View payslip"
          disabled={pending}
          onClick={handleView}
          className="inline-flex size-8 items-center justify-center rounded-md text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10 disabled:opacity-50"
        >
          <Eye className="size-4" strokeWidth={2} />
        </button>
        {error && !open ? (
          <span className="max-w-[12rem] text-right text-xs text-red-700">
            {error}
          </span>
        ) : null}
      </span>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close payslip preview"
                onClick={close}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative z-10 flex max-h-[min(92dvh,56rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-black/8 px-4 py-3">
                  <h3 className="min-w-0 truncate font-serif text-lg text-[#3D421F]">
                    {title}
                  </h3>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={close}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 bg-black/[0.03]">
                  {previewUrl ? (
                    <iframe
                      title={title}
                      src={previewUrl}
                      className="h-[min(80dvh,48rem)] w-full bg-white"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-black/45">
                      Rendering PDF…
                    </div>
                  )}
                </div>
                {error ? (
                  <p className="border-t border-black/8 px-4 py-2 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}
                <div className="flex justify-end border-t border-black/8 px-4 py-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="border border-black/10 bg-white text-[#3D421F] hover:bg-black/5"
                    onClick={close}
                  >
                    Close
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
