import { PartyPopper } from "lucide-react";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { WorkAnniversarySendButton } from "@/components/hr/work-anniversary-send-button";
import { Card } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/hr/derived";
import type { WorkAnniversaryItem } from "@/lib/hr/work-anniversaries";
import { cn } from "@/lib/utils";

type WorkAnniversaryWidgetsProps = {
  items: WorkAnniversaryItem[];
  leadDays: number;
  title?: string;
  titleClassName?: string;
};

const defaultTitleClass = "font-serif text-base text-[#3D421F]";

function yearsLabel(years: number): string {
  return `${years} year${years === 1 ? "" : "s"}`;
}

function daysCaption(daysUntil: number): string {
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "day";
  return "days";
}

export function WorkAnniversaryWidgets({
  items,
  leadDays,
  title = "Work anniversaries",
  titleClassName = defaultTitleClass,
}: WorkAnniversaryWidgetsProps) {
  if (items.length === 0) {
    return (
      <Card className="min-w-0 p-3">
        <h2 className={titleClassName}>{title}</h2>
        <p className="mt-1.5 text-xs text-black/50">
          No work anniversaries in the next {leadDays} days.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full min-w-0 flex-col p-3">
      <div className="mb-2 flex min-w-0 items-center gap-1.5">
        <PartyPopper className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#6B7B3A)]" />
        <h2 className={cn("min-w-0 truncate", titleClassName)}>{title}</h2>
        <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-black/50">
          Next {leadDays} days · {items.length} staff member
          {items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="min-h-0 space-y-1">
        {items.map((item) => (
          <li key={item.staffId}>
            <div
              className={cn(
                "grid grid-cols-[2rem_minmax(0,1fr)_2rem_auto] items-center gap-2 rounded-md px-2.5 py-1.5",
                item.daysUntil === 0
                  ? "bg-[var(--venue-primary,#6B7B3A)]/15 text-[#3D421F]"
                  : item.daysUntil <= 7
                    ? "bg-[var(--venue-primary,#6B7B3A)]/10 text-[#3D421F]"
                    : "bg-white/60 text-[#3D421F]",
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
                employeeStatus={item.employmentStatusName}
                nationality={item.nationalityName}
                dob={item.dob}
                joiningDate={item.joiningDate}
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
                  <span className="font-semibold text-[var(--venue-primary,#6B7B3A)]">
                    {yearsLabel(item.years)}
                  </span>
                  <span className="mx-1.5 text-black/25" aria-hidden>
                    ·
                  </span>
                  <span className="text-black/60">
                    {formatDateOnly(item.anniversaryDate)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <WorkAnniversarySendButton
                  staffId={item.staffId}
                  fullName={item.fullName}
                  empNo={item.empNo}
                  years={item.years}
                  anniversaryDate={item.anniversaryDate}
                />
              </div>
              <div className="flex flex-col items-center justify-center px-0.5 text-center leading-none">
                <span className="min-w-[3ch] text-center text-lg font-semibold tabular-nums">
                  {item.daysUntil}
                </span>
                <span className="mt-0.5 whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-black/50">
                  {daysCaption(item.daysUntil)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
