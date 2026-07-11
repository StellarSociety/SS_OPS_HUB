"use client";

type SalesImportProgressBarProps = {
  label: string;
};

export function SalesImportProgressBar({ label }: SalesImportProgressBarProps) {
  return (
    <div className="mt-3 space-y-2" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-[#3D421F]">{label}</span>
        <span className="text-black/45">Please wait…</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/10">
        <div className="sales-import-progress-indicator h-full w-1/3 rounded-full bg-[var(--venue-primary)]" />
      </div>
    </div>
  );
}
