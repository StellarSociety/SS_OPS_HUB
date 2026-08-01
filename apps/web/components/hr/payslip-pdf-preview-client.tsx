"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPayslipPdfDataUriAsync,
  downloadPayslipPdfAsync,
  loadPayslipPdfLogo,
  type PayslipPdfInput,
} from "@/lib/hr/payslip-pdf";
import { Button } from "@/components/ui/button";

/** Sample payload so we can iterate on PDF layout without a real payslip. */
export const SAMPLE_PAYSLIP_PDF_INPUT: PayslipPdfInput = {
  venueName: "Orilla Restaurant",
  employerLegalName: "Orilla Restaurant FZE",
  companyAddress:
    "Hotel Local, Flo.27th, Al Barsha South, JVT, Dubai, UAE.",
  payrollMonthLabel: "July 2026",
  periodStart: "2026-06-25",
  periodEnd: "2026-07-24",
  paymentDate: "2026-07-28",
  empNo: "ORL0059",
  fullName: "Ahmed Hassan",
  joiningDate: "2022-03-15",
  departmentName: "Kitchen",
  positionName: "Chef de Partie",
  paidDays: 28,
  unpaidDays: 2,
  version: 1,
  paymentMethod: "wps",
  bankName: "Emirates NBD",
  accountNumber: "AE070331234567890123456",
  leaveKinds: [
    {
      code: "AL",
      name: "Annual Leave",
      days: 3,
      bucket: "paid",
      explanation: "Fully paid - salary continues for these days",
    },
    {
      code: "PH",
      name: "Public Holiday Taken",
      days: 1,
      bucket: "paid",
      explanation: "Fully paid - salary continues for these days",
    },
    {
      code: "SL-FP",
      name: "Sick Leave - Full Pay",
      days: 2,
      bucket: "paid",
      explanation: "Fully paid - salary continues for these days",
    },
    {
      code: "UPL",
      name: "Unpaid Leave",
      days: 2,
      bucket: "unpaid",
      explanation: "Unpaid - no salary for these days",
    },
  ],
  lines: [
    { category: "Fixed", label: "Basic salary", amount: 4200 },
    { category: "Fixed", label: "Accommodation", amount: 1750 },
    { category: "Fixed", label: "Transport", amount: 1050 },
    { category: "Variable", label: "Service charge", amount: 480.5 },
    { category: "Variable", label: "Overtime", amount: 220 },
    { category: "Deduction", label: "Loan repayment", amount: -150 },
    { category: "Deduction", label: "Advance recovery", amount: -100 },
  ],
  grossEarnings: 7700.5,
  totalDeductions: 250,
  netSalary: 7450.5,
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
