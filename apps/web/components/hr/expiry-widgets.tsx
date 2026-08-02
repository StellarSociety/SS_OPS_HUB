import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { UpdatedDocsRequestSendButton } from "@/components/hr/updated-docs-request-send-button";
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

const defaultTitleClass = "font-serif text-base text-[#3D421F]";

function urgencyClass(daysUntil: number) {
  if (daysUntil < 0) return "text-red-700 bg-red-50";
  if (daysUntil <= 14) return "text-red-600 bg-red-50/80";
  if (daysUntil <= 30) return "text-amber-700 bg-amber-50";
  return "text-[#3D421F] bg-white/60";
}

function daysCaption(daysUntil: number): string {
  if (daysUntil < 0) {
    return Math.abs(daysUntil) === 1 ? "day overdue" : "days overdue";
  }
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "day";
  return "days";
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
      <Card className="p-3">
        <h2 className={titleClassName}>{title}</h2>
        <p className="mt-1.5 text-xs text-black/50">
          No passport, ID, insurance, or training items expiring within{" "}
          {leadDays} days.
        </p>
      </Card>
    );
  }

  const display = compact ? items.slice(0, 8) : items;

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        <h2 className={titleClassName}>{title}</h2>
        <span className="ml-auto text-[11px] text-black/50">
          Next {leadDays} days · {items.length} item
          {items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-1">
        {display.map((item) => (
          <li key={`${item.staffId}-${item.field}`}>
            <div
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5",
                urgencyClass(item.daysUntil),
              )}
            >
              <Link
                href={`/hr/${item.staffId}`}
                className="min-w-0 flex-1 truncate text-xs transition hover:opacity-90"
              >
                <span className="font-medium">
                  {item.fullName}{" "}
                  <span className="font-normal text-black/50">
                    ({item.empNo})
                  </span>
                </span>
                <span className="mx-1.5 text-black/25" aria-hidden>
                  ·
                </span>
                <span className="text-black/60">{item.label}</span>
                <span className="mx-1.5 text-black/25" aria-hidden>
                  ·
                </span>
                <span className="text-black/60">
                  {formatDateOnly(item.expiryDate)}
                </span>
              </Link>
              {!compact ? (
                <UpdatedDocsRequestSendButton
                  staffId={item.staffId}
                  fullName={item.fullName}
                  empNo={item.empNo}
                  expiry={{
                    label: item.label,
                    expiryDate: item.expiryDate,
                    daysUntil: item.daysUntil,
                  }}
                />
              ) : null}
              <div className="shrink-0 text-center leading-none">
                <span className="block text-lg font-semibold tabular-nums">
                  {Math.abs(item.daysUntil)}
                </span>
                <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-wide text-black/50">
                  {daysCaption(item.daysUntil)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {compact && items.length > display.length ? (
        <p className="mt-2 text-center text-[11px] text-black/50">
          +{items.length - display.length} more — open Human Resources for full
          list
        </p>
      ) : null}
    </Card>
  );
}
