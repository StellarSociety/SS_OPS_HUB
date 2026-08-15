"use client";

import { cn } from "@/lib/utils";

export function RequiresAcknowledgementCheckbox({
  checked,
  onChange,
  disabled,
  name = "requires_acknowledgement",
  includeHidden = true,
  compact = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  name?: string;
  includeHidden?: boolean;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 text-sm text-[#3D421F]",
        compact ? "py-2" : "py-2.5",
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4 rounded border-black/20"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-medium">Requires acknowledgement</span>
        <span className="mt-0.5 block text-xs text-black/55">
          Adds a “Click here to verify” button so the recipient can acknowledge
          this email. Off by default.
        </span>
      </span>
      {includeHidden ? (
        <input type="hidden" name={name} value={checked ? "true" : "false"} />
      ) : null}
    </label>
  );
}
