import { PartyPopper } from "lucide-react";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
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
      <Card className="p-3">
        <h2 className={titleClassName}>{title}</h2>
        <p className="mt-1.5 text-xs text-black/50">
          No work anniversaries in the next {leadDays} days.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <PartyPopper className="h-3.5 w-3.5 text-[var(--venue-primary,#6B7B3A)]" />
        <h2 className={titleClassName}>{title}</h2>
        <span className="ml-auto text-[11px] text-black/50">
          Next {leadDays} days · {items.length} staff member
          {items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.staffId}>
            <div
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5",
                item.daysUntil === 0
                  ? "bg-[var(--venue-primary,#6B7B3A)]/15 text-[#3D421F]"
                  : item.daysUntil <= 7
                    ? "bg-[var(--venue-primary,#6B7B3A)]/10 text-[#3D421F]"
                    : "bg-white/60 text-[#3D421F]",
              )}
            >
              <div className="min-w-0 flex-1 truncate text-xs">
                <span className="font-medium">{item.fullName}</span>
                <span className="mx-1 text-black/25" aria-hidden>
                  (
                </span>
                <StaffDirectoryLink
                  staffId={item.staffId}
                  empNo={item.empNo}
                  className="inline font-normal"
                />
                <span className="text-black/25" aria-hidden>
                  )
                </span>
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
              <WorkAnniversarySendButton
                staffId={item.staffId}
                fullName={item.fullName}
                empNo={item.empNo}
                years={item.years}
                anniversaryDate={item.anniversaryDate}
              />
              <div className="shrink-0 text-right leading-none">
                <span className="block text-lg font-semibold tabular-nums">
                  {item.daysUntil}
                </span>
                <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-wide text-black/50">
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
