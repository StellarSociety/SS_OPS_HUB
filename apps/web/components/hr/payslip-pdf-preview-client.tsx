"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPayslipPdfDataUriAsync,
  downloadPayslipPdfAsync,
  loadPayslipPdfLogo,
  type PayslipPdfInput,
} from "@/lib/hr/payslip-pdf";
import { Button } from "@/components/ui/button";

/** Sample payload — ORL0014 July 2026 (latest generated payslip snapshot). */
export const SAMPLE_PAYSLIP_PDF_INPUT: PayslipPdfInput = {
  venueName: "Orilla",
  employerLegalName: "Orilla Restaurant FZE",
  companyAddress:
    "Hotel Local, Flo.27th, Al Barsha South, JVT, Dubai, UAE.",
  payrollMonthLabel: "July 2026",
  periodStart: "2026-06-25",
  periodEnd: "2026-07-24",
  paymentDate: "2026-07-28",
  empNo: "ORL0014",
  fullName: "Lina Daifi",
  joiningDate: "2025-09-08",
  departmentName: "Receptions & Reservations",
  positionName: "Hostess",
  paidDays: 30,
  unpaidDays: 0,
  version: 2,
  paymentMethod: "wps",
  bankName: "Mashreq Bank",
  accountNumber: "AE150330000019010437991",
  leaveKinds: [
    {
      code: "PH-REPL",
      name: "Public Holiday",
      days: 1,
      bucket: "paid",
      explanation: "Fully paid - salary continues for these days",
    },
  ],
  lines: [
    {
      category: "Fixed",
      label: "Basic salary",
      baseAmount: 4800,
      deductionPercent: 10,
      deductionValue: 480,
      amount: 4320,
    },
    {
      category: "Fixed",
      label: "Accommodation allowance (company housing - not payable)",
      baseAmount: 0,
      amount: 0,
    },
    {
      category: "Fixed",
      label: "Transportation allowance (company housing - not payable)",
      baseAmount: 0,
      amount: 0,
    },
  ],
  grossEarnings: 4320,
  totalDeductions: 480,
  netSalary: 4320,
};

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

export function PayslipPdfPreviewClient({
  input = SAMPLE_PAYSLIP_PDF_INPUT,
  venueLogoUrl = null,
  venueStampUrl = null,
  employerLegalName,
  companyAddress,
  footerDisclaimer,
}: {
  input?: PayslipPdfInput;
  venueLogoUrl?: string | null;
  venueStampUrl?: string | null;
  employerLegalName?: string | null;
  companyAddress?: string | null;
  footerDisclaimer?: string | null;
}) {
  const resolvedInput: PayslipPdfInput = useMemo(
    () => ({
      ...input,
      employerLegalName: employerLegalName ?? input.employerLegalName,
      companyAddress: companyAddress ?? input.companyAddress,
      footerDisclaimer: footerDisclaimer ?? input.footerDisclaimer,
    }),
    [input, employerLegalName, companyAddress, footerDisclaimer],
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stampLoaded, setStampLoaded] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    setStampLoaded(null);

    void (async () => {
      try {
        // Preflight stamp so the UI can show whether it actually embedded.
        if (venueStampUrl) {
          const stamp = await loadPayslipPdfLogo(venueStampUrl);
          if (!cancelled) setStampLoaded(Boolean(stamp));
        } else if (!cancelled) {
          setStampLoaded(false);
        }

        const dataUri = await buildPayslipPdfDataUriAsync(
          resolvedInput,
          venueLogoUrl,
          venueStampUrl,
        );
        const url = dataUriToObjectUrl(dataUri);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl(url);
        setLoading(false);
      } catch (err) {
        console.error("[payslip-pdf-preview]", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render payslip PDF",
          );
          setPreviewUrl(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resolvedInput, venueLogoUrl, venueStampUrl]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="font-serif text-lg text-[#3D421F]">PDF preview</h2>
          <p className="text-sm text-black/55">
            {resolvedInput.employerLegalName || "Employer"}
            {resolvedInput.companyAddress
              ? ` · ${resolvedInput.companyAddress}`
              : ""}
          </p>
          {venueStampUrl ? (
            <p className="text-xs text-black/45">
              Stamp:{" "}
              {stampLoaded == null
                ? "loading…"
                : stampLoaded
                  ? "embedded"
                  : "failed to load — check browser console"}
            </p>
          ) : (
            <p className="text-xs text-black/45">Stamp: none configured</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
          disabled={loading || Boolean(error)}
          onClick={() =>
            void downloadPayslipPdfAsync(
              resolvedInput,
              venueLogoUrl,
              venueStampUrl,
            )
          }
        >
          Download sample PDF
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-[calc(100dvh-12rem)] min-h-[40rem] items-center justify-center text-sm text-black/45">
            Rendering PDF…
          </div>
        ) : error ? (
          <div className="flex h-[calc(100dvh-12rem)] min-h-[40rem] flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <p className="text-xs text-black/45">
              Check the browser console for details.
            </p>
          </div>
        ) : previewUrl ? (
          <iframe
            title="Payslip PDF preview"
            src={previewUrl}
            className="h-[calc(100dvh-12rem)] w-full min-h-[40rem] bg-black/5"
          />
        ) : null}
      </div>
    </div>
  );
}
