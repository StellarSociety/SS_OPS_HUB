"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVenue } from "@/components/providers/venue-provider";
import {
  type HrEmailAcknowledgementRecord,
} from "@/lib/hr/acknowledgement";
import {
  buildEmployeeAcknowledgementCertificatesFilename,
  certificateVenueHeading,
} from "@/lib/hr/acknowledgement-certificate";
import { downloadEmployeeAcknowledgementRegisterPdf } from "@/lib/hr/acknowledgement-employee-register-pdf";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { cn } from "@/lib/utils";

type ExportStatuses = {
  pending: boolean;
  acknowledged: boolean;
  not_acknowledged: boolean;
};

export function AcknowledgementEmployeeExportDialog({
  staffName,
  empNo,
  department = null,
  position = null,
  records,
  onClose,
}: {
  staffName: string;
  empNo: string | null;
  department?: string | null;
  position?: string | null;
  records: HrEmailAcknowledgementRecord[] | null;
  onClose: () => void;
}) {
  const { venue } = useVenue();
  const [include, setInclude] = useState<ExportStatuses>({
    pending: true,
    acknowledged: true,
    not_acknowledged: true,
  });
  const [exporting, startExport] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const venueName = certificateVenueHeading(venue?.name ?? "Venue");
  const venueLogoUrl = venue ? getVenueLogoUrl(venue) : null;

  const pending = useMemo(
    () => records?.filter((row) => row.status === "pending") ?? [],
    [records],
  );
  const acknowledged = useMemo(
    () => records?.filter((row) => row.status === "acknowledged") ?? [],
    [records],
  );
  const declined = useMemo(
    () => records?.filter((row) => row.status === "not_acknowledged") ?? [],
    [records],
  );

  useEffect(() => {
    if (!records) {
      setInclude({ pending: true, acknowledged: true, not_acknowledged: true });
      setError(null);
      return;
    }
    setInclude({
      pending: pending.length > 0,
      acknowledged: acknowledged.length > 0,
      not_acknowledged: declined.length > 0,
    });
    setError(null);
  }, [records, pending.length, acknowledged.length, declined.length]);

  useEffect(() => {
    if (!records) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exporting, onClose, records]);

  if (!records || typeof document === "undefined") return null;

  const selected = [
    ...(include.pending ? pending : []),
    ...(include.acknowledged ? acknowledged : []),
    ...(include.not_acknowledged ? declined : []),
  ].sort((a, b) => a.sentAt.localeCompare(b.sentAt));

  function handleExport() {
    setError(null);
    if (selected.length === 0) {
      setError("Choose pending, accepted, and/or not accepted.");
      return;
    }
    startExport(async () => {
      try {
        await downloadEmployeeAcknowledgementRegisterPdf({
          venueName,
          venueLogoUrl,
          staffName,
          empNo,
          department,
          position,
          records: selected,
          filename: buildEmployeeAcknowledgementCertificatesFilename({
            staffName,
            empNo,
          }),
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not create the PDF.",
        );
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-employee-export-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="ack-employee-export-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              Export certificates
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {staffName}
              {empNo ? ` · ${empNo}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            disabled={exporting}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-black/60">
            Create a PDF table of this employee’s acknowledgements. Choose
            pending, accepted, and/or not accepted.
          </p>
          <label
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm text-[#3D421F]",
              pending.length === 0
                ? "border-black/8 bg-black/[0.02] text-black/40"
                : "border-black/10 bg-white",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
              checked={include.pending}
              disabled={pending.length === 0 || exporting}
              onChange={(event) =>
                setInclude((prev) => ({
                  ...prev,
                  pending: event.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium">Pending</span>
              <span className="mt-0.5 block text-xs text-black/45">
                {pending.length === 0
                  ? "No pending records"
                  : `${pending.length} ${pending.length === 1 ? "record" : "records"}`}
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm text-[#3D421F]",
              acknowledged.length === 0
                ? "border-black/8 bg-black/[0.02] text-black/40"
                : "border-black/10 bg-white",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
              checked={include.acknowledged}
              disabled={acknowledged.length === 0 || exporting}
              onChange={(event) =>
                setInclude((prev) => ({
                  ...prev,
                  acknowledged: event.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium">Accepted</span>
              <span className="mt-0.5 block text-xs text-black/45">
                {acknowledged.length === 0
                  ? "No acknowledged records"
                  : `${acknowledged.length} ${acknowledged.length === 1 ? "record" : "records"}`}
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm text-[#3D421F]",
              declined.length === 0
                ? "border-black/8 bg-black/[0.02] text-black/40"
                : "border-black/10 bg-white",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
              checked={include.not_acknowledged}
              disabled={declined.length === 0 || exporting}
              onChange={(event) =>
                setInclude((prev) => ({
                  ...prev,
                  not_acknowledged: event.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium">Not accepted</span>
              <span className="mt-0.5 block text-xs text-black/45">
                {declined.length === 0
                  ? "No not-acknowledged records"
                  : `${declined.length} ${declined.length === 1 ? "record" : "records"}`}
              </span>
            </span>
          </label>
          {error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : (
            <p className="text-xs text-black/45">
              {selected.length === 0
                ? "Select at least one status to export."
                : `${selected.length} ${selected.length === 1 ? "record" : "records"} will be included.`}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            disabled={exporting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-9 gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
            disabled={exporting || selected.length === 0}
            onClick={handleExport}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? "Exporting…" : "Download PDF"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
