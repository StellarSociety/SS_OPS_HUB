import { employmentStatusSurfaceClass } from "@/lib/hr/employment-status";
import { normalizeVisaStatusLabel } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

/** Staff visa_status select values (staff entry form + visa module). */
const VISA_STATUS_SURFACE: Record<string, string> = {
  "Visa Active self owned": "border-sky-200 bg-sky-100 text-sky-800",
  "Visa Active Provided": "border-green-200 bg-green-100 text-green-800",
  "Visa Applied Pending": "border-amber-200 bg-amber-100 text-amber-800",
  "Visa Dispute": "border-purple-200 bg-purple-100 text-purple-800",
  "Visa Canceled": "border-red-200 bg-red-100 text-red-800",
  // Legacy values still present on older staff rows
  "Visa Self Owned": "border-sky-200 bg-sky-100 text-sky-800",
  "Visa Provided": "border-green-200 bg-green-100 text-green-800",
  "Visa Pending": "border-amber-200 bg-amber-100 text-amber-800",
};

function statusSurfaceClass(status: string): string {
  return (
    employmentStatusSurfaceClass(status) ||
    VISA_STATUS_SURFACE[status] ||
    "border-black/10 bg-black/10 text-black/70"
  );
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return <span className="text-black/40">—</span>;
  const label = normalizeVisaStatusLabel(status) ?? status;
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusSurfaceClass(label),
        className,
      )}
    >
      {label}
    </span>
  );
}
