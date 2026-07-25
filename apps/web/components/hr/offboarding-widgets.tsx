"use client";

import { useMemo, useState } from "react";
import { UserMinus } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateOnly } from "@/lib/hr/derived";
import {
  currentDubaiMonthKey,
  filterOffBoardingByMonth,
  formatOffBoardingMonthLabel,
  type OffBoardingItem,
} from "@/lib/hr/offboarding";
import { cn } from "@/lib/utils";

type OffBoardingWidgetsProps = {
  items: OffBoardingItem[];
  title?: string;
  titleClassName?: string;
  /** Initial month `YYYY-MM`. Defaults to current Dubai calendar month. */
  initialMonthKey?: string;
};

const defaultTitleClass = "font-serif text-lg text-[#3D421F]";

function rowClass(daysUntilTermination: number | null) {
  if (daysUntilTermination == null) {
    return "border-rose-200/70 bg-rose-50/60 text-rose-900";
  }
  if (daysUntilTermination < 0) {
    return "border-rose-200/60 bg-rose-50/40 text-rose-800";
  }
  if (daysUntilTermination <= 7) {
    return "border-rose-300/80 bg-rose-100 text-rose-950";
  }
  if (daysUntilTermination <= 14) {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-rose-200/70 bg-rose-50/70 text-rose-900";
}

function daysLabel(daysUntilTermination: number | null): string | null {
  if (daysUntilTermination == null) return null;
  if (daysUntilTermination === 0) return "Last day today";
  if (daysUntilTermination > 0) {
    return `${daysUntilTermination} day${daysUntilTermination === 1 ? "" : "s"} remaining`;
  }
  const ago = Math.abs(daysUntilTermination);
  return `${ago} day${ago === 1 ? "" : "s"} ago`;
}

export function OffBoardingWidgets({
  items,
  title = "Off boarding",
  titleClassName = defaultTitleClass,
  initialMonthKey,
}: OffBoardingWidgetsProps) {
  const [monthKey, setMonthKey] = useState(
    () => initialMonthKey ?? currentDubaiMonthKey(),
  );

  const filtered = useMemo(
    () => filterOffBoardingByMonth(items, monthKey),
    [items, monthKey],
  );

  const monthLabel = formatOffBoardingMonthLabel(monthKey);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <UserMinus className="h-4 w-4 shrink-0 text-rose-600" />
          <h2 className={titleClassName}>{title}</h2>
          <span className="ml-auto text-xs text-black/50 sm:ml-2">
            {filtered.length} staff member{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-black/55">
          <span className="sr-only">Off boarding month</span>
          <Input
            type="month"
            className="h-8 w-[10.5rem]"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            aria-label="Select off boarding month"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-black/50">
          No staff with a last day in {monthLabel}.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const roleParts = [item.departmentName, item.positionName].filter(
              Boolean,
            );
            const remaining = daysLabel(item.daysUntilTermination);
            return (
              <li key={item.staffId}>
                <Link
                  href={`/hr/${item.staffId}`}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-sm transition hover:opacity-90",
                    rowClass(item.daysUntilTermination),
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
                    {item.joiningDate ? (
                      <>
                        <span>Joined {formatDateOnly(item.joiningDate)}</span>
                        <span
                          className="hidden text-black/25 sm:inline"
                          aria-hidden
                        >
                          ·
                        </span>
                      </>
                    ) : null}
                    {item.workedTime ? (
                      <>
                        <span>{item.workedTime}</span>
                        <span
                          className="hidden text-black/25 sm:inline"
                          aria-hidden
                        >
                          ·
                        </span>
                      </>
                    ) : null}
                    <span>
                      Last day {formatDateOnly(item.terminationDate)}
                    </span>
                    {item.employmentStatusName ? (
                      <>
                        <span
                          className="hidden text-black/25 sm:inline"
                          aria-hidden
                        >
                          ·
                        </span>
                        <span>{item.employmentStatusName}</span>
                      </>
                    ) : null}
                    {remaining ? (
                      <>
                        <span
                          className="hidden text-black/25 sm:inline"
                          aria-hidden
                        >
                          ·
                        </span>
                        <span className="font-medium text-rose-900/90">
                          {remaining}
                        </span>
                      </>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
