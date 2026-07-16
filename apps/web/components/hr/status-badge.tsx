import { employmentStatusSurfaceClass } from "@/lib/hr/employment-status";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return <span className="text-black/40">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        employmentStatusSurfaceClass(status) || "border-black/10 bg-black/10 text-black/70",
        className,
      )}
    >
      {status}
    </span>
  );
}
