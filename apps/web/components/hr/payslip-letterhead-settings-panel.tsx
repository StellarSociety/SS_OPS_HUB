"use client";

import { Stamp, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removePayslipLegalStamp,
  savePayslipLetterheadSettings,
  uploadPayslipLegalStamp,
} from "@/lib/actions/hr-payslip-letterhead";
import type { HrPayslipLetterheadSettings } from "@/lib/hr/types";
import { isStorageBrandAssetUrl } from "@/lib/venue/branding";
import { cn } from "@/lib/utils";

const lightOutlineBtn =
  "h-8 border-black/15 bg-white text-[#3D421F] hover:bg-black/5 hover:text-[#3D421F]";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save letterhead"}
    </Button>
  );
}

export function PayslipLetterheadSettingsPanel({
  settings,
}: {
  settings: HrPayslipLetterheadSettings;
}) {
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companyAddress, setCompanyAddress] = useState(settings.companyAddress);
  const [footerDisclaimer, setFooterDisclaimer] = useState(
    settings.footerDisclaimer,
  );
  const [stampUrl, setStampUrl] = useState(settings.stampUrl);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stampPending, startStampTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasCustomStamp = isStorageBrandAssetUrl(stampUrl);

  const watch = useMemo(
    () =>
      JSON.stringify({
        companyName,
        companyAddress,
        footerDisclaimer,
        stampUrl,
      }),
    [companyName, companyAddress, footerDisclaimer, stampUrl],
  );

  async function onSave(formData: FormData) {
    setStatusMessage(null);
    setStatusError(null);
    formData.set("company_name", companyName);
    formData.set("company_address", companyAddress);
    formData.set("footer_disclaimer", footerDisclaimer);
    const result = await savePayslipLetterheadSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return;
    }
    setStatusMessage("Payslip letterhead saved.");
  }

  function onUploadStamp(file: File | null) {
    if (!file) return;
    setStatusMessage(null);
    setStatusError(null);
    startStampTransition(async () => {
      const fd = new FormData();
      fd.set("stamp", file);
      fd.set("company_name", companyName);
      fd.set("company_address", companyAddress);
      fd.set("footer_disclaimer", footerDisclaimer);
      const result = await uploadPayslipLegalStamp(fd);
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      setStampUrl(result.stampUrl);
      setStatusMessage("Legal stamp uploaded.");
    });
  }

  function onRemoveStamp() {
    if (
      !window.confirm(
        "Remove the uploaded legal stamp? The built-in venue stamp (if any) will be used instead.",
      )
    ) {
      return;
    }
    setStatusMessage(null);
    setStatusError(null);
    startStampTransition(async () => {
      const result = await removePayslipLegalStamp();
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      setStampUrl(result.stampUrl);
      setStatusMessage("Custom legal stamp removed.");
    });
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">
            Payslip document
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Company details printed on payslip PDFs for this venue.
          </p>
        </div>
        <Link
          href="/hr/payslips/preview"
          className="text-sm text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
        >
          Preview PDF
        </Link>
      </div>

      <GuardedSettingsForm
        action={onSave}
        watch={watch}
        className="mt-6 space-y-5"
      >
        <div className="space-y-1.5">
          <Label htmlFor="company_name">Company name</Label>
          <Input
            id="company_name"
            name="company_name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Orilla Restaurant FZE"
            className="h-9"
          />
          <p className="text-xs text-black/45">
            Appears in the payslip title as “Payslip ” plus this name.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company_address">Address</Label>
          <Input
            id="company_address"
            name="company_address"
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            placeholder="Street, area, city, country"
            className="h-9"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Label>Legal stamp</Label>
              <p className="mt-1 text-xs text-black/45">
                Overlay near net salary on the PDF. Black backgrounds are keyed
                out automatically.
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                hasCustomStamp
                  ? "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]"
                  : stampUrl
                    ? "bg-black/5 text-black/50"
                    : "bg-black/5 text-black/40",
              )}
            >
              {hasCustomStamp
                ? "Uploaded"
                : stampUrl
                  ? "Built-in"
                  : "None"}
            </span>
          </div>

          <button
            type="button"
            disabled={stampPending}
            className={cn(
              "relative flex h-36 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors",
              isDragging
                ? "border-[var(--venue-primary,#818a40)]"
                : "border-black/10 hover:border-[var(--venue-primary,#818a40)]/35",
              stampPending && "cursor-not-allowed opacity-60",
            )}
            style={{
              backgroundColor: "#f3f4f0",
              backgroundImage:
                "linear-gradient(45deg, #e4e6dc 25%, transparent 25%), linear-gradient(-45deg, #e4e6dc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e4e6dc 75%), linear-gradient(-45deg, transparent 75%, #e4e6dc 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
            }}
            onClick={() => {
              if (!stampPending) fileRef.current?.click();
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!stampPending) setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (stampPending) return;
              const file = event.dataTransfer.files?.[0];
              if (file) onUploadStamp(file);
            }}
          >
            {isDragging ? (
              <div className="absolute inset-0 bg-[var(--venue-primary,#818a40)]/15" />
            ) : null}
            {stampUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={stampUrl}
                alt="Legal stamp preview"
                className="relative z-[1] max-h-24 max-w-[70%] object-contain"
              />
            ) : (
              <Stamp className="relative z-[1] h-8 w-8 text-black/25" />
            )}
            <p className="relative z-[1] mt-2 text-xs font-medium text-black/55">
              {stampPending
                ? "Uploading…"
                : isDragging
                  ? "Drop to upload"
                  : "Drag & drop or click to upload"}
            </p>
            <p className="relative z-[1] mt-0.5 text-[10px] text-black/40">
              PNG · JPG · WebP — transparency preserved
            </p>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            className="hidden"
            disabled={stampPending}
            onChange={(e) => {
              onUploadStamp(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(lightOutlineBtn, "gap-1.5")}
              disabled={stampPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {stampPending ? "Uploading…" : "Upload new"}
            </Button>
            {hasCustomStamp ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(lightOutlineBtn, "gap-1.5")}
                disabled={stampPending}
                onClick={onRemoveStamp}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove upload
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="footer_disclaimer">Footer disclaimer</Label>
          <textarea
            id="footer_disclaimer"
            name="footer_disclaimer"
            value={footerDisclaimer}
            onChange={(e) => setFooterDisclaimer(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
          />
        </div>

        {statusError ? (
          <p className="text-sm text-red-700" role="alert">
            {statusError}
          </p>
        ) : null}
        {statusMessage ? (
          <p className="text-sm text-emerald-800" role="status">
            {statusMessage}
          </p>
        ) : null}

        <SaveButton />
      </GuardedSettingsForm>
    </div>
  );
}
