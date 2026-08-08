"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  HR_EMAIL_STAFF_DOCUMENT_OPTIONS,
  labelForEmailStaffDocumentKey,
  type HrEmailStaffDocumentKey,
} from "@/lib/hr/email-staff-documents";
import { cn } from "@/lib/utils";

type EmailStaffDocumentsPickerProps = {
  name: string;
  selected: HrEmailStaffDocumentKey[];
  onChange: (next: HrEmailStaffDocumentKey[]) => void;
  requireAttachments: boolean;
  onRequireAttachmentsChange: (next: boolean) => void;
  /** Form field for the require flag. Defaults to `${name}_require`. */
  requireName?: string;
  disabled?: boolean;
  className?: string;
  description?: string;
  /** When true, checkbox grid starts expanded. Default: collapsed. */
  defaultOpen?: boolean;
};

export function EmailStaffDocumentsPicker({
  name,
  selected,
  onChange,
  requireAttachments,
  onRequireAttachmentsChange,
  requireName,
  disabled,
  className,
  description = "Files are pulled from each employee's WorkDrive document folder when the email is sent.",
  defaultOpen = false,
}: EmailStaffDocumentsPickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const selectedSet = new Set(selected);
  const requireField = requireName ?? `${name}_require`;

  function toggle(key: HrEmailStaffDocumentKey, checked: boolean) {
    if (checked) {
      onChange([...selected, key]);
      return;
    }
    onChange(selected.filter((k) => k !== key));
  }

  const summary =
    selected.length === 0
      ? "None selected"
      : selected.length <= 3
        ? selected.map(labelForEmailStaffDocumentKey).join(", ")
        : `${selected.length} documents selected`;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#3D421F]">
            Attach employee documents
          </p>
          <p className="mt-0.5 text-xs text-black/45">{description}</p>
          {!open ? (
            <p className="mt-1 text-xs text-[#3D421F]">{summary}</p>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#3D421F] underline-offset-2 hover:underline disabled:opacity-60"
        >
          {open ? "Hide documents" : "Choose documents"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      <label
        className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
          requireAttachments
            ? "border-[var(--venue-primary,#818a40)]/35 bg-white text-[#3D421F]"
            : "border-black/10 bg-white/80 text-black/65",
          disabled && "opacity-60",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 size-4 rounded border-black/20"
          checked={requireAttachments}
          disabled={disabled}
          onChange={(e) => onRequireAttachmentsChange(e.target.checked)}
        />
        <span className="min-w-0 leading-snug">
          <span className="font-medium text-[#3D421F]">
            Require attachments to send
          </span>
          <span className="mt-0.5 block text-xs text-black/50">
            {requireAttachments
              ? "All selected documents must be in WorkDrive before the email can be sent."
              : "Optional — send without them; only attach selected files that exist."}
          </span>
        </span>
      </label>
      <input
        type="hidden"
        name={requireField}
        value={requireAttachments ? "true" : "false"}
      />

      {/* Marker so an empty selection still posts (no docs attached). */}
      <input type="hidden" name={`${name}_present`} value="1" />
      {/* Keep checkboxes mounted when collapsed so FormData still includes them. */}
      <div className={cn(!open && "hidden")}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {HR_EMAIL_STAFF_DOCUMENT_OPTIONS.map((opt) => {
            const checked = selectedSet.has(opt.key);
            return (
              <label
                key={opt.key}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition",
                  checked
                    ? "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-primary,#818a40)]/[0.06] text-[#3D421F]"
                    : "border-black/10 text-black/65 hover:border-black/20 hover:text-[#3D421F]",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  name={name}
                  value={opt.key}
                  className="mt-0.5 size-4 rounded border-black/20"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => toggle(opt.key, e.target.checked)}
                />
                <span className="min-w-0 leading-snug">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
