"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FileDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SchedulesWeekCalendar } from "@/components/hr/schedules-week-calendar";
import {
  DEFAULT_SCHEDULES_PUBLISH_DEPARTMENTS,
  DEFAULT_SCHEDULES_PUBLISH_VIEW,
  SchedulesPublishDialog,
  type SchedulesPublishDepartments,
  type SchedulesPublishView,
} from "@/components/hr/schedules-publish-dialog";
import {
  listScheduleDaysForRange,
  listWeekSections,
} from "@/lib/actions/hr";
import {
  SCHEDULE_DEPARTMENTS,
  getMondayForWeekOffset,
  getWeekDayColumns,
  type ScheduleDayLabel,
  type ScheduleDepartmentKey,
  type ScheduleStaffRow,
  type ShiftTemplate,
} from "@/lib/hr/schedules";
import {
  getCachedScheduleSections,
  scheduleSectionsCacheKey,
  setCachedScheduleSections,
} from "@/lib/hr/schedules-client-cache";
import {
  exportSchedulesPdf,
  scheduleDaysToCellMap,
  type SchedulesPdfDepartmentBlock,
} from "@/lib/hr/schedules-pdf";
import {
  segmentedSubNavLinkClass,
  segmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

type ScheduleViewMode = "roster" | "sections";

type SchedulesDepartmentTabsProps = {
  staffByDepartment: Record<ScheduleDepartmentKey, ScheduleStaffRow[]>;
  labels: ScheduleDayLabel[];
  shiftTemplates: ShiftTemplate[];
  canEdit?: boolean;
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
};

export function SchedulesDepartmentTabs({
  staffByDepartment,
  labels,
  shiftTemplates = [],
  canEdit = false,
  venueName,
  venueLogoUrl = null,
  userDisplayName,
}: SchedulesDepartmentTabsProps) {
  const [active, setActive] = useState<ScheduleDepartmentKey>("kitchen");
  const [viewByDept, setViewByDept] = useState<
    Record<ScheduleDepartmentKey, ScheduleViewMode>
  >({
    kitchen: "roster",
    bar: "roster",
    floor: "roster",
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishWeekOffset, setPublishWeekOffset] = useState(0);
  const [publishView, setPublishView] = useState<SchedulesPublishView>(
    DEFAULT_SCHEDULES_PUBLISH_VIEW,
  );
  const [publishDepartments, setPublishDepartments] =
    useState<SchedulesPublishDepartments>(DEFAULT_SCHEDULES_PUBLISH_DEPARTMENTS);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, startExport] = useTransition();

  const allStaffIds = useMemo(() => {
    const ids: string[] = [];
    for (const dept of SCHEDULE_DEPARTMENTS) {
      for (const member of staffByDepartment[dept.key] ?? []) {
        ids.push(member.id);
      }
    }
    return ids;
  }, [staffByDepartment]);

  // Warm section bands for every department so Sections view is instant.
  useEffect(() => {
    const monday = getMondayForWeekOffset(weekOffset);
    const weekStart = getWeekDayColumns(monday)[0]?.key;
    if (!weekStart) return;

    let cancelled = false;

    void Promise.all(
      SCHEDULE_DEPARTMENTS.map(async (dept) => {
        const key = scheduleSectionsCacheKey(dept.key, weekStart);
        if (getCachedScheduleSections(key)) return;
        const result = await listWeekSections({
          departmentKey: dept.key,
          weekStart,
        });
        if (cancelled || result.error) return;
        setCachedScheduleSections(key, result.sections ?? []);
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [weekOffset]);

  function setView(dept: ScheduleDepartmentKey, view: ScheduleViewMode) {
    setViewByDept((current) => ({ ...current, [dept]: view }));
  }

  function openPublish() {
    setExportError(null);
    setPublishWeekOffset(weekOffset);
    setPublishView(DEFAULT_SCHEDULES_PUBLISH_VIEW);
    setPublishDepartments({ ...DEFAULT_SCHEDULES_PUBLISH_DEPARTMENTS });
    setPublishOpen(true);
  }

  function handlePublish() {
    setExportError(null);
    startExport(async () => {
      try {
        const monday = getMondayForWeekOffset(publishWeekOffset);
        const weekDays = getWeekDayColumns(monday);
        const fromDate = weekDays[0]?.key;
        const toDate = weekDays[6]?.key;
        if (!fromDate || !toDate) {
          setExportError("Could not resolve the selected week.");
          return;
        }

        const knownCodes = new Set(labels.map((label) => label.code));
        const selectedKeys = SCHEDULE_DEPARTMENTS.map((d) => d.key).filter(
          (key) => publishDepartments[key],
        );

        const blocks: SchedulesPdfDepartmentBlock[] = [];

        for (const key of selectedKeys) {
          const dept = SCHEDULE_DEPARTMENTS.find((entry) => entry.key === key)!;
          const staff = staffByDepartment[key] ?? [];
          const staffIds = staff.map((member) => member.id);

          const [daysResult, sectionsResult] = await Promise.all([
            staffIds.length > 0
              ? listScheduleDaysForRange({ staffIds, fromDate, toDate })
              : Promise.resolve({ days: [] as const }),
            publishView === "sections"
              ? listWeekSections({
                  departmentKey: key,
                  weekStart: fromDate,
                })
              : Promise.resolve({ sections: [] }),
          ]);

          if ("error" in daysResult && daysResult.error) {
            setExportError(daysResult.error);
            return;
          }
          if ("error" in sectionsResult && sectionsResult.error) {
            setExportError(sectionsResult.error);
            return;
          }

          blocks.push({
            departmentKey: key,
            departmentLabel: dept.label,
            staff,
            cells: scheduleDaysToCellMap(
              (daysResult.days ?? []) as {
                staff_id: string;
                work_date: string;
                label_code: string;
                shift_template_id: string | null;
              }[],
              knownCodes,
            ),
            sections: sectionsResult.sections ?? [],
          });
        }

        await exportSchedulesPdf({
          venueName,
          venueLogoUrl,
          weekOffset: publishWeekOffset,
          view: publishView,
          departments: publishDepartments,
          blocks,
          labels,
          shiftTemplates,
          exportedAt: new Date(),
          userDisplayName,
        });
        setPublishOpen(false);
      } catch (error) {
        setExportError(
          error instanceof Error
            ? error.message
            : "Could not publish the schedule PDF.",
        );
      }
    });
  }

  const activeDept = SCHEDULE_DEPARTMENTS.find((dept) => dept.key === active)!;
  const view = viewByDept[active];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-black/10 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                    aria-controls="schedule-panel-active"
                    onClick={() => setActive(dept.key)}
                    className={segmentedSubNavLinkClass(isActive)}
                  >
                    {dept.label}
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={openPublish}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--venue-primary)] px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              Publish
            </button>
          </div>
        </div>

        <div
          id="schedule-panel-active"
          role="tabpanel"
          aria-labelledby={`schedule-tab-${active}`}
          className="p-4 sm:p-5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <nav
              aria-label={`${activeDept.label} schedule view`}
              className={cn(segmentedSubNavShellClass, "w-fit max-w-full")}
            >
              <button
                type="button"
                aria-pressed={view === "roster"}
                onClick={() => setView(active, "roster")}
                className={segmentedSubNavLinkClass(view === "roster")}
              >
                Roster
              </button>
              <button
                type="button"
                aria-pressed={view === "sections"}
                onClick={() => setView(active, "sections")}
                className={segmentedSubNavLinkClass(view === "sections")}
              >
                Sections
              </button>
            </nav>
          </div>

          <SchedulesWeekCalendar
            departmentLabel={activeDept.label}
            departmentKey={active}
            staff={staffByDepartment[active] ?? []}
            loadStaffIds={allStaffIds}
            labels={labels}
            shiftTemplates={shiftTemplates}
            canEdit={canEdit}
            layout={view === "sections" ? "sections" : "flat"}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
          />
        </div>
      </Card>

      <SchedulesPublishDialog
        open={publishOpen}
        weekOffset={publishWeekOffset}
        view={publishView}
        departments={publishDepartments}
        exporting={exporting}
        onWeekOffsetChange={setPublishWeekOffset}
        onViewChange={setPublishView}
        onDepartmentsChange={setPublishDepartments}
        onClose={() => {
          if (!exporting) setPublishOpen(false);
        }}
        onPublish={handlePublish}
      />

      {exportError ? (
        <p className="text-sm text-red-700" role="alert">
          {exportError}
        </p>
      ) : null}
    </div>
  );
}
