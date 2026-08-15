"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVenue } from "@/components/providers/venue-provider";
import { getAcknowledgementSentEmail } from "@/lib/actions/hr-acknowledgements";
import {
  HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS,
  type HrAcknowledgementSentEmail,
  type HrEmailAcknowledgementRecord,
} from "@/lib/hr/acknowledgement";
import {
  buildAcknowledgementCertificateContent,
  buildAcknowledgementCertificateFilename,
  certificateVenueHeading,
  type AcknowledgementCertificateContent,
} from "@/lib/hr/acknowledgement-certificate";
import { downloadAcknowledgementCertificatePdf } from "@/lib/hr/acknowledgement-certificate-pdf";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { cn } from "@/lib/utils";

function statusTone(status: AcknowledgementCertificateContent["status"]): string {
  if (status === "acknowledged") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "not_acknowledged") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-black/45">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap break-words text-[12px] leading-snug text-[#3D421F]">
        {value}
      </dd>
    </div>
  );
}

export function AcknowledgementCertificateDialog({
  record,
  department = null,
  position = null,
  onClose,
}: {
  record: HrEmailAcknowledgementRecord | null;
  department?: string | null;
  position?: string | null;
  onClose: () => void;
}) {
  const { venue } = useVenue();
  const [pending, startTransition] = useTransition();
  const [downloading, startDownload] = useTransition();
  const [email, setEmail] = useState<HrAcknowledgementSentEmail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());

  const venueName = venue?.name?.trim() || "Venue";
  const venueHeading = certificateVenueHeading(venueName);
  const venueLogoUrl = venue ? getVenueLogoUrl(venue) : null;

  useEffect(() => {
    if (!record) {
      setEmail(null);
      setError(null);
      setDownloadError(null);
      return;
    }
    setEmail(null);
    setError(null);
    setDownloadError(null);
    setGeneratedAt(new Date());
    startTransition(async () => {
      const result = await getAcknowledgementSentEmail(record.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail(result.email);
    });
  }, [record?.id]);

  useEffect(() => {
    if (!record) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, record]);

  if (!record || typeof document === "undefined") return null;

  const content = buildAcknowledgementCertificateContent({
    venueName: venueHeading,
    record,
    email,
    generatedAt,
    department,
    position,
  });
  const filename = buildAcknowledgementCertificateFilename({
    staffName: record.staffName,
    empNo: record.empNo,
    sentAt: record.sentAt,
  });

  function handleDownload() {
    setDownloadError(null);
    startDownload(async () => {
      try {
        await downloadAcknowledgementCertificatePdf(
          content,
          filename,
          venueLogoUrl,
        );
      } catch (err) {
        setDownloadError(
          err instanceof Error ? err.message : "Could not download the PDF.",
        );
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-certificate-title"
        className="flex max-h-[min(94vh,56rem)] w-full max-w-[54rem] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="ack-certificate-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              Acknowledgement certificate
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {record.staffName} · {record.emailKindLabel}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-3 sm:px-5 sm:py-4">
          {pending && !email && !error ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-black/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing certificate…
            </div>
          ) : (
            <article className="mx-auto flex aspect-[210/297] w-[min(100%,210mm,calc((94vh-10.5rem)*210/297))] flex-col overflow-hidden border-2 border-[var(--venue-primary,#818a40)] bg-white shadow-sm">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-[var(--venue-primary,#818a40)]/40 m-1.5 px-4 py-3 sm:px-5 sm:py-4">
                <header className="shrink-0 space-y-1.5 text-center">
                  {venueLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={venueLogoUrl}
                      alt={venueName}
                      className="mx-auto h-9 w-auto max-w-[180px] object-contain"
                    />
                  ) : null}
                  <p className="font-serif text-xs text-[#3D421F]">{venueHeading}</p>
                  <h3 className="font-serif text-xl leading-tight text-[#3D421F] sm:text-2xl">
                    Certificate of Acknowledgement
                  </h3>
                  <div className="mx-auto h-px w-20 bg-[var(--venue-primary,#818a40)]" />
                  <p className="font-serif text-xs italic text-black/50">
                    This certifies that
                  </p>
                  <p className="font-serif text-lg leading-tight text-[#3D421F]">
                    {content.employeeName}
                  </p>
                  <p className="mx-auto w-fit rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] text-black/50">
                    {content.employeeMetaLine}
                  </p>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                      statusTone(content.status),
                    )}
                  >
                    {HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[content.status]}
                  </span>
                </header>

                {error ? (
                  <p className="mt-3 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Sent email details could not be loaded ({error}). The
                    certificate still includes the acknowledgement record.
                  </p>
                ) : null}

                <section className="mt-4 shrink-0">
                  <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    <MetaRow label="Sent" value={content.sentAtLabel} />
                    <MetaRow label="Template" value={content.emailKindLabel} />
                    <MetaRow label="From" value={content.fromEmail} />
                    <MetaRow label="To" value={content.toEmail} />
                    <div className="sm:col-span-2">
                      <MetaRow label="Subject" value={content.subject} />
                    </div>
                  </dl>
                </section>

                <section className="mt-3 flex min-h-0 flex-1 flex-col space-y-2">
                  <h4 className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--venue-primary,#818a40)]">
                    Terms & Conditions Policy Message
                  </h4>
                  <div
                    className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-2 text-[12px] leading-relaxed text-[#3D421F] [&_b]:font-bold [&_em]:italic [&_i]:italic [&_strong]:font-bold [&_u]:underline"
                    dangerouslySetInnerHTML={{ __html: content.messageHtml }}
                  />
                </section>

                <section className="mt-3 shrink-0 space-y-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--venue-primary,#818a40)]">
                    Employee Acknowledgement
                  </h4>
                  <dl className="space-y-1.5">
                    <MetaRow label="Status" value={content.statusLabel} />
                    <MetaRow label="Confirmed" value={content.respondedAtLabel} />
                    <MetaRow label="How" value={content.acknowledgedHow} />
                    {content.comments ? (
                      <MetaRow label="Comments" value={content.comments} />
                    ) : null}
                  </dl>
                </section>

                <p className="mt-3 shrink-0 text-center text-[10px] text-black/40">
                  Generated {content.generatedAtLabel} · {venueHeading}
                </p>
              </div>
            </article>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 px-5 py-3">
          {downloadError ? (
            <p className="mr-auto max-w-[18rem] text-sm text-red-700">
              {downloadError}
            </p>
          ) : null}
          <Button
            type="button"
            className="h-9 gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
            disabled={pending || downloading}
            onClick={handleDownload}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
