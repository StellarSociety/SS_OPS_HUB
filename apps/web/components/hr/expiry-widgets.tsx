import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/hr/derived";
import type { ExpiryItem } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type ExpiryWidgetsProps = {
  items: ExpiryItem[];
  leadDays: number;
  title?: string;
  titleClassName?: string;
  compact?: boolean;
};

const defaultTitleClass = "font-serif text-lg text-[#3D421F]";

function urgencyClass(daysUntil: number) {
  if (daysUntil < 0) return "text-red-700 bg-red-50";
  if (daysUntil <= 14) return "text-red-600 bg-red-50/80";
  if (daysUntil <= 30) return "text-amber-700 bg-amber-50";
  return "text-[#3D421F] bg-white/60";
}

export function ExpiryWidgets({
  items,
  leadDays,
  title = "Upcoming expiries",
  titleClassName = defaultTitleClass,
  compact = false,
}: ExpiryWidgetsProps) {
  if (items.length === 0) {
    return (
      <Card className="p-5">
        <h2 className={titleClassName}>{title}</h2>
        <p className="mt-2 text-sm text-black/50">
          No passport, ID, insurance, or training items expiring within{" "}
          {leadDays} days.
        </p>
      </Card>
    );
  }

  const display = compact ? items.slice(0, 8) : items;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className={titleClassName}>{title}</h2>
        <span className="ml-auto text-xs text-black/50">
          Next {leadDays} days · {items.length} item
          {items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-2">
        {display.map((item) => (
          <li key={`${item.staffId}-${item.field}`}>
            <Link
              href={`/hr/${item.staffId}`}
              className={cn(
                "flex flex-col gap-1 rounded-lg px-3 py-2 text-sm transition hover:opacity-90 sm:flex-row sm:items-center sm:gap-3",
                urgencyClass(item.daysUntil),
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.fullName}{" "}
                <span className="font-normal text-black/50">({item.empNo})</span>
              </span>
              <span className="shrink-0 text-black/60">{item.label}</span>
              <span className="shrink-0 font-medium">
                {formatDateOnly(item.expiryDate)}
                <span className="ml-1 font-normal text-black/50">
                  {item.daysUntil < 0
                    ? `(${Math.abs(item.daysUntil)}d overdue)`
                    : `(in ${item.daysUntil}d)`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {compact && items.length > display.length ? (
        <p className="mt-3 text-center text-xs text-black/50">
          +{items.length - display.length} more — open Human Resources for full
          list
        </p>
      ) : null}
    </Card>
  );
}
