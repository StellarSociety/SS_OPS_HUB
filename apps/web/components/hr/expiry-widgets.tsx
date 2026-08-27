import { UpdatedDocsRequestSendButton } from "@/components/hr/updated-docs-request-send-button";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { AlertTriangle, type LucideIcon } from "lucide-react";
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
  emptyDescription?: string;
  icon?: LucideIcon;
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
  emptyDescription,
  icon: Icon = AlertTriangle,
}: ExpiryWidgetsProps) {
  const emptyText =
    emptyDescription ??
    `No items expiring within ${leadDays} days.`;

  if (items.length === 0) {
    return (
      <Card className="min-w-0 p-3">
        <div className="mb-1 flex min-w-0 items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <h2 className={cn("min-w-0 truncate", titleClassName)}>{title}</h2>
        </div>
        <p className="mt-1.5 text-xs text-black/50">{emptyText}</p>
      </Card>
    );
  }

  const display = compact ? items.slice(0, 8) : items;

  return (
    <Card className="flex h-full min-w-0 flex-col p-3">
      <div className="mb-2 flex min-w-0 items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <h2 className={cn("min-w-0 truncate", titleClassName)}>{title}</h2>
        <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-black/50">
          Next {leadDays} days · {items.length} item
          {items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="min-h-0 space-y-1">
        {display.map((item) => (
          <li key={`${item.staffId}-${item.field}`}>
            <div
              className={cn(
                "grid items-center gap-2 rounded-md px-2.5 py-1.5",
                compact
                  ? "grid-cols-[2rem_minmax(0,1fr)_auto]"
                  : "grid-cols-[2rem_minmax(0,1fr)_2rem_auto]",
                urgencyClass(item.daysUntil),
              )}
            >
              <StaffPhotoThumbnail
                fullName={item.fullName}
                photoUrl={item.photoUrl}
                size="sm"
                className="h-9 w-8 shrink-0 rounded-md"
                empNo={item.empNo}
                department={item.departmentName}
                position={item.positionName}
                employeeStatus={item.employeeStatusName}
                workingStatus={item.workingStatusName}
                nationality={item.nationalityName}
                dob={item.dob}
                joiningDate={item.joiningDate}
                terminationDate={item.terminationDate}
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{item.fullName}</div>
                <div className="mt-0.5 truncate text-[11px] leading-tight">
                  <StaffDirectoryLink
                    staffId={item.staffId}
                    empNo={item.empNo}
                    className="inline font-normal"
                  />
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
                </div>
              </div>
              {!compact ? (
                <div className="flex items-center justify-center">
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
                </div>
              ) : null}
              <div className="flex flex-col items-center justify-center px-0.5 text-center leading-none">
                <span className="min-w-[3ch] text-center text-lg font-semibold tabular-nums">
                  {Math.abs(item.daysUntil)}
                </span>
                <span className="mt-0.5 whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-black/50">
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
