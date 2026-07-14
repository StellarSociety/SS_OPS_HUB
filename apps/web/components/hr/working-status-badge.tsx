import { cn } from "@/lib/utils";

const WORKING_STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  "Paid Leave": "bg-sky-100 text-sky-800",
  "Unpaid Leave": "bg-amber-100 text-amber-800",
  "OFF-Boarding": "bg-rose-100 text-rose-800",
};

type WorkingStatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

export function WorkingStatusBadge({
  status,
  className,
}: WorkingStatusBadgeProps) {
  const label = status?.trim() || "Active";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        WORKING_STATUS_STYLES[label] ?? "bg-black/10 text-black/70",
        className,
      )}
    >
      {label}
    </span>
  );
}
