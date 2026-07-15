"use client";

import { SchedulesWeekCalendar } from "@/components/hr/schedules-week-calendar";
import type {
  ScheduleDayLabel,
  ScheduleDepartmentKey,
  ScheduleStaffRow,
  ShiftTemplate,
} from "@/lib/hr/schedules";

type SchedulesWeekSectionsProps = {
  departmentKey: ScheduleDepartmentKey;
  departmentLabel: string;
  staff: ScheduleStaffRow[];
  labels: ScheduleDayLabel[];
  shiftTemplates?: ShiftTemplate[];
  canEdit?: boolean;
};

/** Sections view = same weekly roster grid, grouped under section header rows. */
export function SchedulesWeekSections({
  departmentKey,
  departmentLabel,
  staff,
  labels,
  shiftTemplates = [],
  canEdit = false,
}: SchedulesWeekSectionsProps) {
  return (
    <SchedulesWeekCalendar
      departmentLabel={departmentLabel}
      departmentKey={departmentKey}
      staff={staff}
      labels={labels}
      shiftTemplates={shiftTemplates}
      canEdit={canEdit}
      layout="sections"
    />
  );
}
