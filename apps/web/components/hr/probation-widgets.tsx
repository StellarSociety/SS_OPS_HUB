import { Clock } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/hr/derived";
import type { OnProbationItem } from "@/lib/hr/probation";
import { cn } from "@/lib/utils";

type ProbationWidgetsProps = {
  items: OnProbationItem[];
  title?: string;
  titleClassName?: string;
};

const defaultTitleClass = "font-serif text-lg text-[#3D421F]";

function remainingClass(remainingDays: number) {
  if (remainingDays <= 14) return "border-amber-300/80 bg-amber-100 text-amber-900";
  if (remainingDays <= 30) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-amber-200/70 bg-amber-50/70 text-amber-800";
}

export function ProbationWidgets({
  items,
  title = "On probation",
  titleClassName = defaultTitleClass,
}: ProbationWidgetsProps) {
  if (items.length === 0) {
    return (
      <Card className="p-5">
        <h2 className={titleClassName}>{title}</h2>
        <p className="mt-2 text-sm text-black/50">
          No ON Board staff currently within their probation period.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-600" />
        <h2 className={titleClassName}>{title}</h2>
        <span className="ml-auto text-xs text-black/50">
          {items.length} staff member{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const roleParts = [item.departmentName, item.positionName].filter(
            Boolean,
          );
          return (
            <li key={item.staffId}>
              <Link
                href={`/hr/${item.staffId}`}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm transition hover:opacity-90",
                  remainingClass(item.remainingDays),
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.fullName}{" "}
                    <span className="font-normal text-black/50">
                      ({item.empNo})
                    </span>
                  </span>
                  {roleParts.length > 0 ? (
                    <span className="shrink-0 truncate text-black/55">
                      {roleParts.join(" · ")}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5 text-xs leading-snug text-black/65 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-0.5">
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
                    {item.remainingDays} day
                    {item.remainingDays === 1 ? "" : "s"} remaining
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
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
