"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SchedulesWeekCalendar } from "@/components/hr/schedules-week-calendar";
import {
  SCHEDULE_DEPARTMENTS,
  scheduleDayLabelStyle,
  type ScheduleDayLabel,
  type ScheduleDepartmentKey,
  type ScheduleStaffRow,
} from "@/lib/hr/schedules";
import {
  segmentedSubNavLinkClass,
  segmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

type SchedulesDepartmentTabsProps = {
  staffByDepartment: Record<ScheduleDepartmentKey, ScheduleStaffRow[]>;
  labels: ScheduleDayLabel[];
  canEdit?: boolean;
};

export function SchedulesDepartmentTabs({
  staffByDepartment,
  labels,
  canEdit = false,
}: SchedulesDepartmentTabsProps) {
  const [active, setActive] = useState<ScheduleDepartmentKey>("kitchen");
  const [labelsOpen, setLabelsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <button
          type="button"
          aria-expanded={labelsOpen}
          onClick={() => setLabelsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
        >
          <span className="font-nav text-sm font-semibold uppercase tracking-[0.08em] text-[#3D421F]">
            Roster Labels
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-black/45 transition-transform duration-200",
              labelsOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {labelsOpen ? (
          <div className="border-t border-black/10 px-4 py-3">
            <ul className="space-y-1.5">
              {labels.map((label) => (
                <li key={label.code} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 inline-flex min-w-[3.25rem] shrink-0 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={scheduleDayLabelStyle(label)}
                  >
                    {label.abbreviation}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm text-[#3D421F]">{label.name}</p>
                    {/* Clarifications / instructions for this label can go here later. */}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-black/10 p-3 sm:p-4">
          <nav
            aria-label="Schedule departments"
            className={cn(segmentedSubNavShellClass, "max-w-lg")}
            role="tablist"
          >
            {SCHEDULE_DEPARTMENTS.map((dept) => {
              const isActive = active === dept.key;
              return (
                <button
                  key={dept.key}
                  type="button"
                  role="tab"
                  id={`schedule-tab-${dept.key}`}
                  aria-selected={isActive}
                  aria-controls={`schedule-panel-${dept.key}`}
                  onClick={() => setActive(dept.key)}
                  className={segmentedSubNavLinkClass(isActive)}
                >
                  {dept.label}
                </button>
              );
            })}
          </nav>
        </div>

        {SCHEDULE_DEPARTMENTS.map((dept) => {
          const isActive = active === dept.key;
          return (
            <div
              key={dept.key}
              id={`schedule-panel-${dept.key}`}
              role="tabpanel"
              aria-labelledby={`schedule-tab-${dept.key}`}
              hidden={!isActive}
              className="p-4 sm:p-5"
            >
              <SchedulesWeekCalendar
                departmentLabel={dept.label}
                staff={staffByDepartment[dept.key] ?? []}
                labels={labels}
                canEdit={canEdit}
              />
            </div>
          );
        })}
      </Card>
    </div>
  );
}
