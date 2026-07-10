import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  Hiring: "bg-blue-100 text-blue-800",
  "ON Board": "bg-emerald-100 text-emerald-800",
  "OFF Board": "bg-amber-100 text-amber-800",
  OUT: "bg-neutral-200 text-neutral-600",
};

type StatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return <span className="text-black/40">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? "bg-black/10 text-black/70",
        className,
      )}
    >
      {status}
    </span>
  );
}
