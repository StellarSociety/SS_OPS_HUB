import { Clock } from "lucide-react";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { Card } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/hr/derived";
import type { OnProbationItem } from "@/lib/hr/probation";
import { cn } from "@/lib/utils";

type ProbationWidgetsProps = {
  items: OnProbationItem[];
  title?: string;
  titleClassName?: string;
  /**
   * `panel` — overview card matching Off boarding panel chrome.
   * `list` — full-width stacked list (default).
   */
  variant?: "list" | "panel";
};

const defaultTitleClass = "font-serif text-base text-[#3D421F]";

function remainingClass(remainingDays: number) {
  if (remainingDays <= 14) return "border-amber-300/80 bg-amber-100 text-amber-950";
  if (remainingDays <= 30) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-amber-200/70 bg-amber-50/70 text-amber-900";
}

function remainingLabel(remainingDays: number): string {
  return `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining`;
}

function ProbationPersonHeader({ item }: { item: OnProbationItem }) {
  return (
    <span className="min-w-0 flex-1 truncate font-medium">
      {item.fullName}{" "}
      <span className="font-normal text-black/50">
        (
        <StaffDirectoryLink
          staffId={item.staffId}
          empNo={item.empNo}
          className="inline font-normal"
        />
        )
      </span>
    </span>
  );
}

export function ProbationWidgets({
  items,
  title = "On probation",
  titleClassName = defaultTitleClass,
  variant = "list",
}: ProbationWidgetsProps) {
  if (variant === "panel") {
    return (
      <Card className="flex h-full min-h-[17.5rem] flex-col p-4">
        <div className="flex items-center gap-1.5">
          <Clock
            className="h-4 w-4 shrink-0 text-amber-600/80"
            aria-hidden
          />
          <h3 className="min-w-0 flex-1 truncate font-serif text-base text-[#3D421F]">
            {title}
          </h3>
          <span className="shrink-0 text-xs tabular-nums text-black/50">
            {items.length}
          </span>
        </div>
        <hr className="mt-2 shrink-0 border-t-2 border-black/15" />

        {items.length === 0 ? (
          <div className="mt-3 flex flex-1 items-center justify-center text-xs text-black/45">
            No staff on probation
          </div>
        ) : (
          <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {items.map((item) => (
              <li key={item.staffId}>
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5",
                    remainingClass(item.remainingDays),
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">
                      {item.fullName}{" "}
                      <span className="font-normal text-black/50">
                        (
                        <StaffDirectoryLink
                          staffId={item.staffId}
                          empNo={item.empNo}
                          className="inline font-normal"
                        />
                        )
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-black/60">
                      Last day {formatDateOnly(item.legalEndDate)}
                    </span>
                  </div>
                  <div className="shrink-0 text-right leading-none">
                    <span className="block text-lg font-semibold tabular-nums">
                      {item.remainingDays}
                    </span>
                    <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-wide text-black/50">
                      {item.remainingDays === 1 ? "day" : "days"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-3">
        <h2 className={titleClassName}>{title}</h2>
        <p className="mt-1.5 text-xs text-black/50">
          No ON Board staff currently within their probation period.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        <h2 className={titleClassName}>{title}</h2>
        <span className="ml-auto text-[11px] text-black/50">
          {items.length} staff member{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item) => {
          const roleParts = [item.departmentName, item.positionName].filter(
            Boolean,
          );
          return (
            <li key={item.staffId}>
              <div
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-xs",
                  remainingClass(item.remainingDays),
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
                  <ProbationPersonHeader item={item} />
                  {roleParts.length > 0 ? (
                    <span className="shrink-0 truncate text-black/55">
                      {roleParts.join(" · ")}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5 text-[11px] leading-snug text-black/65 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-0.5">
                  <span>
                    Joined {formatDateOnly(item.commencementDate)}
                  </span>
                  <span className="hidden text-black/25 sm:inline" aria-hidden>
                    ·
                  </span>
                  <span>{item.durationLabel}</span>
                  <span className="hidden text-black/25 sm:inline" aria-hidden>
                    ·
                  </span>
                  <span>
                    Last day {formatDateOnly(item.legalEndDate)}
                  </span>
                  <span className="hidden text-black/25 sm:inline" aria-hidden>
                    ·
                  </span>
                  <span className="font-medium text-amber-900/90">
                    {remainingLabel(item.remainingDays)}
                  </span>
                  {item.calendarDaysElapsed != null ? (
                    <>
                      <span
                        className="hidden text-black/25 sm:inline"
                        aria-hidden
                      >
                        ·
                      </span>
                      <span>
                        {item.calendarDaysElapsed} day
                        {item.calendarDaysElapsed === 1 ? "" : "s"} elapsed
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
