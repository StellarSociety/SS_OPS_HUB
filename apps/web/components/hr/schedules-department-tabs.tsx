"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, FileDown, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SchedulesWeekCalendar } from "@/components/hr/schedules-week-calendar";
import { SchedulesWeekNav } from "@/components/hr/schedules-week-nav";
import {
  DEFAULT_SCHEDULES_PUBLISH_DEPARTMENTS,
  DEFAULT_SCHEDULES_PUBLISH_VIEW,
  SchedulesPublishDialog,
  type SchedulesPublishDepartments,
  type SchedulesPublishView,
} from "@/components/hr/schedules-publish-dialog";
import { SchedulesSendApprovalDialog } from "@/components/hr/schedules-send-approval-dialog";
import { SchedulesApproveConfirmDialog } from "@/components/hr/schedules-approve-confirm-dialog";
import {
  listScheduleDaysForRange,
  listWeekSections,
} from "@/lib/actions/hr";
import {
  approveScheduleWeek,
  getScheduleApprovalForWeek,
  requestScheduleApproval,
  type ScheduleApproverCandidate,
} from "@/lib/actions/hr-schedule-approval";
import {
  SCHEDULE_DEPARTMENTS,
  filterStaffForWeek,
  getMondayForWeekOffset,
  getWeekDayColumns,
  weekStartKeyFromDate,
  type ScheduleDayLabel,
  type ScheduleDepartmentKey,
  type ScheduleStaffRow,
  type ShiftTemplate,
} from "@/lib/hr/schedules";
import type { PublicHoliday, ScheduleApprovalRequest } from "@/lib/hr/types";
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
  publicHolidays?: PublicHoliday[];
  canEdit?: boolean;
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  currentUserId: string;
  approverPool: ScheduleApproverCandidate[];
  initialApprovalByWeek?: Record<string, ScheduleApprovalRequest | null>;
};

function approvalStatusLabel(request: ScheduleApprovalRequest | null | undefined) {
  if (!request) return "Draft";
  if (request.status === "pending") return "Pending approval";
  if (request.status === "approved") return "Approved";
  return "Draft";
}

export function SchedulesDepartmentTabs({
  staffByDepartment,
  labels,
  shiftTemplates = [],
  publicHolidays = [],
  canEdit = false,
  venueName,
  venueLogoUrl = null,
  userDisplayName,
  currentUserId,
  approverPool,
  initialApprovalByWeek = {},
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
  const [approvalByWeek, setApprovalByWeek] = useState(initialApprovalByWeek);
  const [sendOpen, setSendOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalPending, startApproval] = useTransition();
  const unsavedGuardRef = useRef<(action: () => void) => void>((action) => {
    action();
  });
  const registerUnsavedGuard = useCallback(
    (guard: ((action: () => void) => void) | null) => {
      unsavedGuardRef.current =
        guard ??
        ((action) => {
          action();
        });
    },
    [],
  );
  const [exporting, startExport] = useTransition();

  const weekMonday = useMemo(
    () => getMondayForWeekOffset(weekOffset),
    [weekOffset],
  );
  const weekStart = weekStartKeyFromDate(weekMonday);
  const publicHolidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const holiday of publicHolidays) {
      map.set(holiday.holidayDate, holiday.name);
    }
    return map;
  }, [publicHolidays]);
  const weekRequest = approvalByWeek[weekStart] ?? null;

  useEffect(() => {
    let cancelled = false;
    void getScheduleApprovalForWeek(weekStart).then((result) => {
      if (cancelled || result.error) return;
      setApprovalByWeek((prev) => ({
        ...prev,
        [weekStart]: result.request ?? null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const canSendApproval =
    canEdit &&
    approverPool.length > 0 &&
    weekRequest?.status !== "pending" &&
    weekRequest?.status !== "approved";
  const canApprove =
    weekRequest?.status === "pending" &&
    (weekRequest.approver_user_ids ?? []).includes(currentUserId);
  const canPublishPdf = canEdit && weekRequest?.status === "approved";

  const staffByDepartmentForWeek = useMemo(() => {
    const next = {
      kitchen: filterStaffForWeek(staffByDepartment.kitchen ?? [], weekMonday),
      bar: filterStaffForWeek(staffByDepartment.bar ?? [], weekMonday),
      floor: filterStaffForWeek(staffByDepartment.floor ?? [], weekMonday),
    } satisfies Record<ScheduleDepartmentKey, ScheduleStaffRow[]>;
    return next;
  }, [staffByDepartment, weekMonday]);

  const allStaff = useMemo(() => {
    const byId = new Map<string, ScheduleStaffRow>();
    for (const dept of SCHEDULE_DEPARTMENTS) {
      for (const member of staffByDepartmentForWeek[dept.key] ?? []) {
        byId.set(member.id, member);
      }
    }
    return [...byId.values()];
  }, [staffByDepartmentForWeek]);

  const allStaffIds = useMemo(() => allStaff.map((s) => s.id), [allStaff]);

  function selectDepartment(key: ScheduleDepartmentKey) {
    unsavedGuardRef.current(() => setActive(key));
  }

  function setView(dept: ScheduleDepartmentKey, mode: ScheduleViewMode) {
    unsavedGuardRef.current(() =>
      setViewByDept((prev) => ({ ...prev, [dept]: mode })),
    );
  }

  function openPublish() {
    if (!canPublishPdf) return;
    setExportError(null);
    setPublishWeekOffset(weekOffset);
    setPublishOpen(true);
  }

  function openSendApproval() {
    setApprovalError(null);
    setSendOpen(true);
  }

  function openApprove() {
    setApprovalError(null);
    setApproveOpen(true);
  }

  function handleSendApproval(approverUserIds: string[]) {
    startApproval(async () => {
      setApprovalError(null);
      const result = await requestScheduleApproval({
        weekStart,
        approverUserIds,
      });
      if (result.error) {
        setApprovalError(result.error);
        return;
      }
      setApprovalByWeek((prev) => ({
        ...prev,
        [weekStart]: result.request ?? null,
      }));
      setSendOpen(false);
    });
  }

  function handleApproveConfirm() {
    startApproval(async () => {
      setApprovalError(null);
      const result = await approveScheduleWeek({ weekStart });
      if (result.error) {
        setApprovalError(result.error);
        return;
      }
      setApprovalByWeek((prev) => ({
        ...prev,
        [weekStart]: result.request ?? null,
      }));
      setApproveOpen(false);
    });
  }

  function handlePublish() {
    startExport(async () => {
      setExportError(null);
      try {
        const monday = getMondayForWeekOffset(publishWeekOffset);
        const days = getWeekDayColumns(monday, publicHolidayByDate);
        const fromDate = days[0]?.key;
        const toDate = days[days.length - 1]?.key;
        if (!fromDate || !toDate) {
          setExportError("Could not resolve week dates.");
          return;
        }

        const knownCodes = new Set(labels.map((l) => l.code));
        const selectedDepts = SCHEDULE_DEPARTMENTS.filter(
          (d) => publishDepartments[d.key],
        );
        const blocks: SchedulesPdfDepartmentBlock[] = [];

        for (const dept of selectedDepts) {
          const key = dept.key;
          const staff = filterStaffForWeek(
            staffByDepartment[key] ?? [],
            monday,
          );
          const staffIds = staff.map((s) => s.id);

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
          publicHolidayByDate,
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
  const statusLabel = approvalStatusLabel(weekRequest);

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
                    onClick={() => selectDepartment(dept.key)}
                    className={segmentedSubNavLinkClass(isActive)}
                  >
                    {dept.label}
                  </button>
                );
              })}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium",
                  weekRequest?.status === "approved" &&
                    "border-emerald-200 bg-emerald-50 text-emerald-800",
                  weekRequest?.status === "pending" &&
                    "border-amber-200 bg-amber-50 text-amber-800",
                  !weekRequest && "border-black/10 bg-white text-black/55",
                )}
              >
                {statusLabel}
              </span>

              {canEdit ? (
                <button
                  type="button"
                  onClick={openSendApproval}
                  disabled={!canSendApproval || approvalPending}
                  title={
                    approverPool.length === 0
                      ? "Configure approvers in HR Settings → Attendance → Schedule Approval"
                      : weekRequest?.status === "approved"
                        ? "This week is already approved"
                        : weekRequest?.status === "pending"
                          ? "Approval already requested"
                          : undefined
                  }
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-3.5 text-sm font-semibold text-[#3D421F] transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Send className="h-4 w-4" aria-hidden />
                  Send for approval
                </button>
              ) : null}

              {canApprove ? (
                <button
                  type="button"
                  onClick={openApprove}
                  disabled={approvalPending}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Approved
                </button>
              ) : null}

              <button
                type="button"
                onClick={openPublish}
                disabled={!canPublishPdf || exporting}
                title={
                  canPublishPdf
                    ? undefined
                    : "Approve this week before publishing the PDF"
                }
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--venue-primary)] px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <FileDown className="h-4 w-4" aria-hidden />
                Publish
              </button>
            </div>
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

            <SchedulesWeekNav
              weekOffset={weekOffset}
              onWeekOffsetChange={setWeekOffset}
              guardAction={(action) => unsavedGuardRef.current(action)}
            />
          </div>

          <SchedulesWeekCalendar
            departmentLabel={activeDept.label}
            departmentKey={active}
            staff={staffByDepartmentForWeek[active] ?? []}
            loadStaffIds={allStaffIds}
            attendanceStaff={allStaff}
            labels={labels}
            shiftTemplates={shiftTemplates}
            publicHolidayByDate={publicHolidayByDate}
            canEdit={canEdit}
            layout={view === "sections" ? "sections" : "flat"}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            onRegisterUnsavedGuard={registerUnsavedGuard}
            hideWeekNavigation
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

      <SchedulesSendApprovalDialog
        open={sendOpen}
        weekOffset={weekOffset}
        candidates={approverPool}
        pending={approvalPending}
        error={approvalError}
        onClose={() => {
          if (!approvalPending) setSendOpen(false);
        }}
        onSubmit={handleSendApproval}
      />

      <SchedulesApproveConfirmDialog
        open={approveOpen}
        weekOffset={weekOffset}
        pending={approvalPending}
        error={approvalError}
        onClose={() => {
          if (!approvalPending) setApproveOpen(false);
        }}
        onConfirm={handleApproveConfirm}
      />

      {exportError ? (
        <p className="text-sm text-red-700" role="alert">
          {exportError}
        </p>
      ) : null}
    </div>
  );
}
