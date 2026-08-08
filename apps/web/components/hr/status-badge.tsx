import { employmentStatusSurfaceClass } from "@/lib/hr/employment-status";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

/** Staff visa_status select values (staff entry form). */
const VISA_STATUS_SURFACE: Record<string, string> = {
  "Visa Self Owned": "border-sky-200 bg-sky-100 text-sky-800",
  "Visa Provided": "border-violet-200 bg-violet-100 text-violet-800",
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
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusSurfaceClass(status),
        className,
      )}
    >
      {status}
    </span>
  );
}
