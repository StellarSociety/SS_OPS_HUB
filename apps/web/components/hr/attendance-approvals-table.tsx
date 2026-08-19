"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, ChevronDown, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { usePersistedHrAttendanceValidationFilters } from "@/components/hr/use-persisted-hr-filters";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StatusBadge } from "@/components/hr/status-badge";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AttendanceDayRangePicker,
  AttendanceMultiWeekPicker,
  AttendancePayrollMonthPicker,
} from "@/components/hr/attendance-date-filters";
import {
  approveAttendanceDays,
  loadAttendanceValidationRowsForRange,
  saveValidationRosterDays,
  type ValidationRosterLabelCode,
} from "@/lib/actions/hr-attendance";
import { getOffboardingLeaveSnapshot } from "@/lib/actions/hr-offboarding";
import {
  ATTENDANCE_APPROVED_STATUS,
  attendanceDayRequiresApproval,
} from "@/lib/hr/attendance-approval";
import { computeEmploymentDuration, computeWorkTime } from "@/lib/hr/derived";
import {
  formatLeaveDays,
  liveLeaveBalanceTriple,
} from "@/lib/hr/leave";
import { exportAttendanceValidationPdf } from "@/lib/hr/attendance-validation-pdf";
import {
  DEFAULT_SCHEDULE_VARIANCE_MINUTES,
  shiftNeedsApproval,
} from "@/lib/hr/schedule-variance";
import { clearAllCachedScheduleDays } from "@/lib/hr/schedules-client-cache";
import {
  calendarDateKeyInTimezone,
  formatIsoDateShort,
  isStaffEmployedOnWorkDate,
  rosterLabelKeepsShiftTimes,
  scheduleDayLabelStyle,
} from "@/lib/hr/schedules";
import { DEFAULT_HR_ATTENDANCE_IMPORT_RULES } from "@/lib/hr/types";
import { cn } from "@/lib/utils";
import {
  isOffBoardingForWeek,
  resolveWorkingStatus,
} from "@/lib/hr/working-status";

export type AttendanceApprovalRow = {
  id: string | null;
  staffId: string | null;
  workDate: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  rosterLabel: string | null;
  scheduleTime: string | null;
  scheduleStartTime?: string | null;
  scheduleEndTime?: string | null;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number | null;
  attendanceStatus: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | "flagged" | null;
  issue: string | null;
};

type DepartmentOption = { id: string; name: string };

type EmployeeOption = {
  id: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  positionName?: string | null;
  joiningDate?: string | null;
  terminationDate?: string | null;
  photoUrl?: string | null;
  employmentStatus?: string | null;
  workingStatus?: string | null;
  nationality?: string | null;
  dob?: string | null;
  todayRosterLabel?: string | null;
};

/** Staged roster edit: a label code, or null to clear the saved roster day. */
type RosterDraft = ValidationRosterLabelCode | null;

type ScheduleLabelOption = {
  code: string;
  abbreviation: string;
  name: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
};

type Props = {
  rows: AttendanceApprovalRow[];
  departments: DepartmentOption[];
  employees: EmployeeOption[];
  scheduleLabels: ScheduleLabelOption[];
  /** YYYY-MM-DD → holiday name (same purple highlight as Schedules). */
  publicHolidayByDate?: Record<string, string>;
  canEditRoster: boolean;
  /** Prefill department + employee from leave detail / deep links. */
  initialStaffId?: string | null;
  /** Prefill day range (e.g. current payroll period) from deep links. */
  initialFromDate?: string | null;
  initialToDate?: string | null;
  /** Grace minutes between schedule and punches (default 40). */
  scheduleVarianceMinutes?: number;
  timezone?: string;
  /** Venue payroll period window (e.g. 25 → 24). */
  payrollPeriodStartDay?: number;
  payrollPeriodEndDay?: number;
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  heading: string;
  description: string;
};

type RosterActionGroupId = "duty" | "paid" | "unpaid";

type RosterActionDef = {
  code: ValidationRosterLabelCode;
  /** Roster label_code stored when this action is applied. */
  rosterCode: string;
  /** Fallback tooltip if schedule settings label is missing. */
  fallbackTitle: string;
  group: RosterActionGroupId;
};

const ROSTER_ACTION_GROUPS: Array<{
  id: RosterActionGroupId;
  label: string;
}> = [
  { id: "duty", label: "Paid Working" },
  { id: "paid", label: "Paid Leave" },
  { id: "unpaid", label: "Unpaid Leave" },
];

function AttendanceTableColgroup() {
  return (
    <colgroup>
      <col className="w-[5.5rem]" />
      <col className="w-[4.5rem]" />
      <col className="w-[7rem]" />
      <col className="w-[5rem]" />
      <col className="w-[5.5rem]" />
      <col className="w-[7rem]" />
      <col className="w-[10rem]" />
      <col />
      <col className="w-[3.25rem]" />
    </colgroup>
  );
}

const ACTION_CHIP_SIZING =
  "inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide";

/** Invisible chips so a header label is as wide as its button group. */
function ActionGroupWidthSizer({ codes }: { codes: string[] }) {
  return (
    <div className="h-0 overflow-hidden whitespace-nowrap" aria-hidden>
      <div className="flex items-center gap-1.5">
        {codes.map((code) => (
          <span key={code} className={ACTION_CHIP_SIZING}>
            {code}
          </span>
        ))}
      </div>
    </div>
  );
}

function resolveSelectedRosterAction(
  row: AttendanceApprovalRow,
  draft: RosterDraft | undefined,
  hasDraft: boolean,
  actions: RosterActionDef[],
): RosterActionDef | null {
  if (hasDraft) {
    if (draft == null) return null;
    return actions.find((action) => action.code === draft) ?? null;
  }
  return (
    actions.find((action) => rosterMatchesAction(row.rosterLabel, action)) ??
    null
  );
}

function RosterActionDropdown({
  groups,
  labelsByCode,
  selectedAction,
  isPublicHoliday,
  disabled,
  onSelect,
  onClear,
}: {
  groups: Array<{
    id: string;
    label: string;
    actions: RosterActionDef[];
  }>;
  labelsByCode: Map<string, ScheduleLabelOption>;
  selectedAction: RosterActionDef | null;
  isPublicHoliday: boolean;
  disabled: boolean;
  onSelect: (code: ValidationRosterLabelCode) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selectedLabel = selectedAction
    ? labelsByCode.get(selectedAction.rosterCode)
    : undefined;

  function updatePanelPos() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 220);
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8,
    );
    setPanelPos({ top: rect.bottom + 4, left, width });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onReposition() {
      updatePanelPos();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div className="min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          selectedAction
            ? `Selected action ${selectedAction.code}`
            : "Select Action"
        }
        onClick={() => {
          if (disabled) return;
          setOpen((value) => !value);
        }}
        className={cn(
          "inline-flex h-7 w-full min-w-[8.5rem] max-w-[14rem] items-center justify-between gap-2 rounded-md border px-2 text-[11px] font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-45",
          selectedAction ? "uppercase" : "font-medium",
        )}
        style={
          selectedLabel
            ? scheduleDayLabelStyle(selectedLabel)
            : selectedAction
              ? {
                  backgroundColor: "#f5f5f5",
                  color: "#404040",
                  borderColor: "#d4d4d4",
                }
              : {
                  backgroundColor: "#ffffff",
                  color: "rgba(0,0,0,0.55)",
                  borderColor: "rgba(0,0,0,0.15)",
                }
        }
      >
        <span className="min-w-0 truncate">
          {selectedAction ? selectedAction.code : "Select Action"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </button>
      {open && panelPos
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[250] overflow-hidden rounded-md border border-black/10 bg-white py-1 shadow-lg"
              style={{
                top: panelPos.top,
                left: panelPos.left,
                width: panelPos.width,
              }}
            >
              <ul role="listbox" className="max-h-72 overflow-y-auto">
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-xs text-black/50 hover:bg-black/[0.04]"
                    onClick={() => {
                      onClear();
                      setOpen(false);
                    }}
                  >
                    Select Action
                  </button>
                </li>
                {groups.map((group) => (
                  <li key={group.id} className="border-t border-black/5 pt-1">
                    <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-black/40">
                      {group.label}
                    </p>
                    <ul>
                      {group.actions.map((action) => {
                        const label = labelsByCode.get(action.rosterCode);
                        const phReplOnHoliday =
                          action.code === "PH-REPL" && isPublicHoliday;
                        const isSelected = selectedAction?.code === action.code;
                        return (
                          <li key={action.code}>
                            <button
                              type="button"
                              disabled={phReplOnHoliday}
                              title={
                                phReplOnHoliday
                                  ? "Calendar public holiday — use OFF or SH instead"
                                  : (label?.name ?? action.fallbackTitle)
                              }
                              onClick={() => {
                                if (phReplOnHoliday) return;
                                if (!isSelected) onSelect(action.code);
                                setOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-black/[0.04] disabled:opacity-40",
                                isSelected && "bg-black/[0.04]",
                              )}
                            >
                              <span
                                className={ACTION_CHIP_SIZING}
                                style={
                                  label
                                    ? scheduleDayLabelStyle(label)
                                    : {
                                        backgroundColor: "#f5f5f5",
                                        color: "#404040",
                                        borderColor: "#d4d4d4",
                                      }
                                }
                              >
                                {action.code}
                              </span>
                              <span className="min-w-0 truncate text-xs text-[#3D421F]">
                                {label?.name ?? action.fallbackTitle}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Validation actions in three groups:
 * 1. Paid Working — SH / OFF / PH-REPL
 * 2. Paid Leave — AL / SL / ML / PL / BL
 * 3. Unpaid Leave — UPL / ABS
 *
 * Calendar PH (holiday taken) is not a button: OFF on a public-holiday date
 * auto-saves as PH. Working SH on a public holiday accrues PH-REPL credit.
 */
const ROSTER_ACTION_DEFS: RosterActionDef[] = [
  {
    code: "SH",
    rosterCode: "SHIFT",
    fallbackTitle: "Working shift (payroll, hours unchanged)",
    group: "duty",
  },
  {
    code: "OFF",
    rosterCode: "OFF",
    fallbackTitle: "Day off (paid)",
    group: "duty",
  },
  {
    code: "PH-REPL",
    rosterCode: "PH-REPL",
    fallbackTitle: "Public holiday replacement taken (uses a banked PH day)",
    group: "duty",
  },
  { code: "AL", rosterCode: "AL", fallbackTitle: "Annual leave", group: "paid" },
  { code: "SL", rosterCode: "SL", fallbackTitle: "Sick leave", group: "paid" },
  {
    code: "ML",
    rosterCode: "ML",
    fallbackTitle: "Maternity leave",
    group: "paid",
  },
  {
    code: "PL",
    rosterCode: "PL",
    fallbackTitle: "Parental leave",
    group: "paid",
  },
  {
    code: "BL",
    rosterCode: "BL",
    fallbackTitle: "Bereavement leave",
    group: "paid",
  },
  {
    code: "UPL",
    rosterCode: "UPL",
    fallbackTitle: "Unpaid leave",
    group: "unpaid",
  },
  {
    code: "ABS",
    rosterCode: "ABS",
    fallbackTitle:
      "Absence — keeps scheduled times (expected to work, did not attend)",
    group: "unpaid",
  },
];

/** True when the saved roster label matches this action (incl. legacy LP → AL). */
function rosterMatchesAction(
  rosterLabel: string | null | undefined,
  action: RosterActionDef,
): boolean {
  if (!rosterLabel) return false;
  if (rosterLabel === action.rosterCode) return true;
  if (action.rosterCode === "AL" && rosterLabel === "LP") return true;
  // Calendar holiday taken (PH) is the auto form of OFF on a public-holiday date.
  if (action.rosterCode === "OFF" && rosterLabel === "PH") return true;
  return false;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Decimal hours (e.g. 9.81) → duration time `H:MM` (e.g. 9:49). */
function formatHoursAsTime(totalHours: number | null | undefined): string {
  if (totalHours == null || !Number.isFinite(Number(totalHours))) return "—";
  const totalMinutes = Math.round(Number(totalHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.abs(totalMinutes % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function approvalStatusLabel(
  status: AttendanceApprovalRow["approvalStatus"],
): string {
  if (status === ATTENDANCE_APPROVED_STATUS) return "Approved";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  if (status === "flagged") return "Flagged";
  return "—";
}

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSundayIso(iso: string): boolean {
  const date = parseIsoDate(iso);
  return date ? date.getDay() === 0 : false;
}

/** Every calendar day (Mon–Sun) covered by the selected week Monday keys. */
function datesForWeekKeys(weekKeys: string[]): string[] {
  const dates: string[] = [];
  for (const key of [...weekKeys].sort()) {
    const monday = parseIsoDate(key);
    if (!monday) continue;
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      dates.push(toDateKey(day));
    }
  }
  return dates;
}

/** Inclusive calendar days from startDate → endDate (YYYY-MM-DD). */
function datesForDayRange(startDate: string, endDate: string): string[] {
  const startKey = startDate <= endDate ? startDate : endDate;
  const endKey = startDate <= endDate ? endDate : startDate;
  const start = parseIsoDate(startKey);
  const end = parseIsoDate(endKey);
  if (!start || !end) return [];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function issueAfterRosterLabel(
  labelCode: ValidationRosterLabelCode,
  clockIn: string | null,
  clockOut: string | null,
): string | null {
  if (labelCode === "SH") return null;
  if (clockIn || clockOut) {
    return `Punches on roster day “${labelCode}”`;
  }
  return null;
}

function formatScheduleRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!start || !end) return null;
  return `${start} – ${end}`;
}

function rosterCodeForAction(code: ValidationRosterLabelCode): string {
  return code === "SH" ? "SHIFT" : code;
}

function draftKey(empNo: string, workDate: string): string {
  return `${empNo.trim().toLowerCase()}::${workDate}`;
}

/** Next.js opaque flight/RSC errors after a successful server action. */
function isNextFlightDigestError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = "message" in err ? String((err as { message?: unknown }).message ?? "") : "";
  const digest =
    "digest" in err && (err as { digest?: unknown }).digest != null
      ? String((err as { digest?: unknown }).digest)
      : "";
  return (
    Boolean(digest) ||
    message.includes("Server Components render") ||
    message.includes("digest property")
  );
}

/** Selection key — only days that actually need Validation approval. */
function selectionKey(
  row: AttendanceApprovalRow,
  opts?: { varianceMinutes: number; timezone: string } | null,
): string | null {
  const need = attendanceDayRequiresApproval({
    rosterLabel: row.rosterLabel,
    approvalStatus: row.approvalStatus,
    workDate: row.workDate,
    attendanceId: row.id,
    scheduleStart: row.scheduleStartTime ?? null,
    scheduleEnd: row.scheduleEndTime ?? null,
    clockIn: row.clockIn,
    clockOut: row.clockOut,
    issue: row.issue,
    timezone: opts?.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
    varianceMinutes:
      opts?.varianceMinutes ??
      DEFAULT_HR_ATTENDANCE_IMPORT_RULES.scheduleVarianceMinutes,
  });
  if (!need.needs) return null;

  if (row.id) return `id:${row.id}`;
  // Leave / ABS without an attendance row — approve via staff+date stub.
  if (need.kind === "leave" && row.staffId) {
    return `day:${draftKey(row.empNo, row.workDate)}`;
  }
  return null;
}

function LeaveBalanceTriple({
  title,
  loading,
  eligible,
  left,
  taken,
  className,
}: {
  title: string;
  loading: boolean;
  eligible: number | null;
  left: number | null;
  taken: number | null;
  className?: string;
}) {
  const missing = eligible == null || left == null || taken == null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center",
        className,
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
        {title}
      </span>
      {loading ? (
        <span className="text-sm font-medium text-[#3D421F]">…</span>
      ) : missing ? (
        <span className="text-sm font-medium text-[#3D421F]">—</span>
      ) : (
        <div
          className="grid min-w-0 grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-x-1"
          title={`Eligible ${formatLeaveDays(eligible)} · Left ${formatLeaveDays(left)} · Taken ${formatLeaveDays(taken)}`}
        >
          <LeaveTripleStat label="Eligible" value={eligible} tone="muted" />
          <span className="mb-px text-[11px] text-black/25" aria-hidden>
            |
          </span>
          <LeaveTripleStat label="Left" value={left} tone="accent" />
          <span className="mb-px text-[11px] text-black/25" aria-hidden>
            |
          </span>
          <LeaveTripleStat label="Taken" value={taken} tone="ink" />
        </div>
      )}
    </div>
  );
}

function LeaveTripleStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "accent" | "ink";
}) {
  return (
    <div className="min-w-0 text-center">
      <p
        className={cn(
          "text-[9px] font-medium uppercase tracking-wide",
          tone === "muted" && "text-black/40",
          tone === "accent" && "text-[var(--venue-primary,#818a40)]",
          tone === "ink" && "text-[#3D421F]/70",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-medium tabular-nums leading-tight",
          tone === "muted" && "text-black/55",
          tone === "accent" && "text-[var(--venue-primary,#818a40)]",
          tone === "ink" && "text-[#3D421F]",
        )}
      >
        {formatLeaveDays(value)}
      </p>
    </div>
  );
}

function TenureMetrics({
  employmentDuration,
  workTime,
  workTimeLoading,
  className,
}: {
  employmentDuration: string | null;
  workTime: string | null;
  workTimeLoading: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-stretch", className)}>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
        <span
          className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-black/45"
          title="Calendar time from joining until today (or termination)"
        >
          Employment duration
        </span>
        <span className="whitespace-nowrap text-sm font-medium tabular-nums text-[#3D421F]">
          {employmentDuration ?? "—"}
        </span>
      </div>
      <div
        className="mx-2 hidden w-px shrink-0 self-stretch bg-black/10 sm:block"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
        <span
          className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-black/45"
          title="Employment duration minus unpaid leave (UPL) and unauthorised absence (ABS)"
        >
          Work time
        </span>
        <span className="whitespace-nowrap text-sm font-medium tabular-nums text-[#3D421F]">
          {workTimeLoading ? "…" : (workTime ?? "—")}
        </span>
      </div>
    </div>
  );
}

function emptyRowForDay(opts: {
  staffId: string | null;
  workDate: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
}): AttendanceApprovalRow {
  return {
    id: null,
    staffId: opts.staffId,
    workDate: opts.workDate,
    empNo: opts.empNo,
    fullName: opts.fullName,
    departmentId: opts.departmentId,
    rosterLabel: null,
    scheduleTime: null,
    scheduleStartTime: null,
    scheduleEndTime: null,
    clockIn: null,
    clockOut: null,
    totalHours: null,
    attendanceStatus: null,
    approvalStatus: null,
    issue: null,
  };
}

function localRowAfterRosterChange(
  existing: AttendanceApprovalRow | undefined,
  change: {
    staffId: string;
    empNo: string;
    workDate: string;
    labelCode: ValidationRosterLabelCode | null;
  },
  person: EmployeeOption | undefined,
): AttendanceApprovalRow {
  const keepTimes =
    change.labelCode != null &&
    rosterLabelKeepsShiftTimes(rosterCodeForAction(change.labelCode));
  const start = keepTimes ? (existing?.scheduleStartTime ?? null) : null;
  const end = keepTimes ? (existing?.scheduleEndTime ?? null) : null;
  return {
    ...(existing ??
      emptyRowForDay({
        staffId: change.staffId,
        workDate: change.workDate,
        empNo: change.empNo,
        fullName: person?.fullName ?? change.empNo,
        departmentId: person?.departmentId ?? null,
      })),
    staffId: change.staffId,
    rosterLabel:
      change.labelCode == null ? null : rosterCodeForAction(change.labelCode),
    scheduleTime: keepTimes
      ? (existing?.scheduleTime ?? formatScheduleRange(start, end))
      : null,
    scheduleStartTime: start,
    scheduleEndTime: end,
    issue:
      change.labelCode == null
        ? null
        : issueAfterRosterLabel(
            change.labelCode,
            existing?.clockIn ?? null,
            existing?.clockOut ?? null,
          ),
  };
}

export function AttendanceApprovalsTable({
  rows,
  departments,
  employees,
  scheduleLabels,
  publicHolidayByDate = {},
  canEditRoster,
  initialStaffId = null,
  initialFromDate = null,
  initialToDate = null,
  scheduleVarianceMinutes = DEFAULT_SCHEDULE_VARIANCE_MINUTES,
  timezone = DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
  payrollPeriodStartDay = 25,
  payrollPeriodEndDay = 24,
  venueName,
  venueLogoUrl = null,
  userDisplayName,
  heading,
  description,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [busyAction, setBusyAction] = useState<"save" | "approve" | null>(
    null,
  );
  const [local, setLocal] = useState(rows);
  const {
    departmentId,
    empNo,
    selectedWeekKeys,
    dayStart,
    dayEnd,
    hydrated,
    setSelectedWeekKeys,
    setDayRange,
    patchFilters,
  } = usePersistedHrAttendanceValidationFilters();
  /** Staged roster actions keyed by empNo::workDate — saved together. null = clear. */
  const [drafts, setDrafts] = useState<Record<string, RosterDraft>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingRange, setLoadingRange] = useState(false);
  const [leaveSnapshot, setLeaveSnapshot] = useState<{
    year: number;
    alEligible: number;
    alLeft: number;
    alTaken: number;
    alScheduled: number;
    phEligible: number;
    phLeft: number;
    phTaken: number;
    phScheduled: number;
    unpaidLeaveDays: number;
    days: { workDate: string; labelCode: string }[];
  } | null>(null);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveRefreshKey, setLeaveRefreshKey] = useState(0);
  const appliedInitialStaffRef = useRef<string | null>(null);

  const hasWeekFilter = selectedWeekKeys.length > 0;
  const hasDayRange = Boolean(dayStart && dayEnd);
  const rangeStart =
    dayStart && dayEnd
      ? dayStart <= dayEnd
        ? dayStart
        : dayEnd
      : "";
  const rangeEnd =
    dayStart && dayEnd
      ? dayStart <= dayEnd
        ? dayEnd
        : dayStart
      : "";

  const selectedDates = useMemo(() => {
    if (hasWeekFilter) return datesForWeekKeys(selectedWeekKeys);
    if (hasDayRange) return datesForDayRange(rangeStart, rangeEnd);
    return [];
  }, [hasWeekFilter, hasDayRange, selectedWeekKeys, rangeStart, rangeEnd]);

  const periodKey = useMemo(
    () =>
      hasWeekFilter
        ? `w:${[...selectedWeekKeys].sort().join(",")}`
        : hasDayRange
          ? `d:${rangeStart}:${rangeEnd}`
          : "",
    [hasWeekFilter, hasDayRange, selectedWeekKeys, rangeStart, rangeEnd],
  );

  useEffect(() => {
    if (!hydrated) return;
    const staffId = initialStaffId?.trim();
    if (!staffId) return;
    const from = initialFromDate?.trim() || "";
    const to = initialToDate?.trim() || "";
    const applyKey = `${staffId}|${from}|${to}`;
    if (appliedInitialStaffRef.current === applyKey) return;
    const employee = employees.find((e) => e.id === staffId);
    if (!employee) return;
    appliedInitialStaffRef.current = applyKey;
    const hasRange = Boolean(from && to && from <= to);
    patchFilters({
      empNo: employee.empNo,
      ...(employee.departmentId
        ? { departmentId: employee.departmentId }
        : {}),
      ...(hasRange
        ? {
            dayStart: from,
            dayEnd: to,
            selectedWeekKeys: [],
          }
        : {}),
    });
  }, [
    hydrated,
    initialStaffId,
    initialFromDate,
    initialToDate,
    employees,
    patchFilters,
  ]);

  const labelsByCode = useMemo(() => {
    const map = new Map<string, ScheduleLabelOption>();
    for (const label of scheduleLabels) {
      map.set(label.code, label);
    }
    return map;
  }, [scheduleLabels]);

  /** Prefer configured schedule labels; fall back to the full built-in set. */
  const rosterActions = useMemo(() => {
    const configured = new Set(scheduleLabels.map((label) => label.code));
    if (configured.size === 0) return ROSTER_ACTION_DEFS;
    const fromSettings = ROSTER_ACTION_DEFS.filter(
      (action) =>
        configured.has(action.rosterCode) ||
        // PH-REPL may be missing from older label sets that only had PH.
        (action.rosterCode === "PH-REPL" && configured.has("PH")),
    );
    return fromSettings.length > 0 ? fromSettings : ROSTER_ACTION_DEFS;
  }, [scheduleLabels]);

  const rosterActionGroups = useMemo(() => {
    return ROSTER_ACTION_GROUPS.map((group) => ({
      ...group,
      actions: rosterActions.filter((action) => action.group === group.id),
    })).filter((group) => group.actions.length > 0);
  }, [rosterActions]);

  const departmentOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: d.id,
        label: d.name,
      })),
    [departments],
  );

  const employeeOptions = useMemo(() => {
    const pool = departmentId
      ? employees.filter((e) => e.departmentId === departmentId)
      : employees;
    return pool
      .map((employee) => ({
        value: employee.empNo,
        label: `${employee.empNo} · ${employee.fullName}`,
      }))
      .sort((a, b) =>
        a.value.localeCompare(b.value, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [employees, departmentId]);

  const employeesByEmpNo = useMemo(
    () => employeeOptions.map((option) => option.value),
    [employeeOptions],
  );

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.empNo === empNo),
    [employees, empNo],
  );

  const employmentDuration = useMemo(
    () =>
      selectedEmployee
        ? computeEmploymentDuration(
            selectedEmployee.joiningDate,
            selectedEmployee.terminationDate,
          )
        : null,
    [selectedEmployee],
  );

  const workTime = useMemo(
    () =>
      selectedEmployee
        ? computeWorkTime(
            selectedEmployee.joiningDate,
            selectedEmployee.terminationDate,
            leaveSnapshot?.unpaidLeaveDays ?? 0,
          )
        : null,
    [selectedEmployee, leaveSnapshot?.unpaidLeaveDays],
  );

  useEffect(() => {
    const staffId = selectedEmployee?.id;
    if (!staffId) {
      setLeaveSnapshot(null);
      setLeaveLoading(false);
      return;
    }

    let cancelled = false;
    setLeaveLoading(true);
    setLeaveSnapshot(null);

    void getOffboardingLeaveSnapshot({ staffId }).then((result) => {
      if (cancelled) return;
      setLeaveLoading(false);
      if (result.error) {
        setLeaveSnapshot(null);
        return;
      }
      setLeaveSnapshot({
        year: result.year,
        alEligible: result.alAvail,
        alLeft: result.alBalance,
        alTaken: result.alUsed,
        alScheduled: result.alScheduled,
        phEligible: result.phAvail,
        phLeft: result.phBalance,
        phTaken: result.phUsed,
        phScheduled: result.phScheduled,
        unpaidLeaveDays: result.unpaidLeaveDays,
        days: result.days,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedEmployee?.id, leaveRefreshKey]);

  const ready = Boolean(empNo && (hasWeekFilter || hasDayRange));

  useEffect(() => {
    if (!ready || !empNo || selectedDates.length === 0) {
      setLoadingRange(false);
      return;
    }

    const sorted = [...selectedDates].sort();
    const fromDate = sorted[0]!;
    const toDate = sorted[sorted.length - 1]!;
    const empKey = empNo.trim().toLowerCase();

    let cancelled = false;
    setLoadingRange(true);

    void loadAttendanceValidationRowsForRange({ fromDate, toDate, empNo }).then(
      (result) => {
        if (cancelled) return;
        setLoadingRange(false);
        if (!result.ok) {
          setActionError(result.error);
          return;
        }

        setLocal((prev) => {
          const byKey = new Map(
            prev.map((r) => [draftKey(r.empNo, r.workDate), r] as const),
          );
          for (const row of result.rows) {
            if (row.empNo.trim().toLowerCase() !== empKey) continue;
            byKey.set(draftKey(row.empNo, row.workDate), row);
          }
          return [...byKey.values()];
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [ready, empNo, periodKey, selectedDates]);

  const draftEntries = useMemo(() => Object.entries(drafts), [drafts]);
  const draftCount = draftEntries.length;
  const hasDrafts = draftCount > 0;

  const filtered = useMemo(() => {
    if (!ready || !selectedEmployee || selectedDates.length === 0) return [];

    const empKey = empNo.trim().toLowerCase();
    const byDate = new Map<string, AttendanceApprovalRow>();
    const dateSet = new Set(selectedDates);

    for (const row of local) {
      if (row.empNo.trim().toLowerCase() !== empKey) continue;
      if (!dateSet.has(row.workDate)) continue;
      byDate.set(row.workDate, row);
    }

    return selectedDates.map((workDate) => {
      const base =
        byDate.get(workDate) ??
        emptyRowForDay({
          staffId: selectedEmployee.id,
          workDate,
          empNo,
          fullName: selectedEmployee.fullName,
          departmentId: selectedEmployee.departmentId,
        });
      const key = draftKey(empNo, workDate);
      if (!(key in drafts)) return base;
      const draft = drafts[key];
      if (draft == null) {
        return {
          ...base,
          rosterLabel: null,
          scheduleTime: null,
          scheduleStartTime: null,
          scheduleEndTime: null,
          issue: null,
        };
      }

      const keepTimes = rosterLabelKeepsShiftTimes(rosterCodeForAction(draft));
      return {
        ...base,
        rosterLabel: rosterCodeForAction(draft),
        scheduleTime: keepTimes ? base.scheduleTime : null,
        scheduleStartTime: keepTimes ? base.scheduleStartTime : null,
        scheduleEndTime: keepTimes ? base.scheduleEndTime : null,
        issue: issueAfterRosterLabel(draft, base.clockIn, base.clockOut),
      };
    });
  }, [
    local,
    ready,
    empNo,
    selectedDates,
    selectedEmployee,
    drafts,
  ]);

  const liveLeave = useMemo(() => {
    if (!leaveSnapshot) return null;
    const empKey = empNo.trim().toLowerCase();
    const overlay: { workDate: string; labelCode: string | null }[] = [];
    for (const row of local) {
      if (row.empNo.trim().toLowerCase() !== empKey) continue;
      overlay.push({ workDate: row.workDate, labelCode: row.rosterLabel });
    }
    for (const row of filtered) {
      overlay.push({ workDate: row.workDate, labelCode: row.rosterLabel });
    }
    return liveLeaveBalanceTriple({
      snapshot: leaveSnapshot,
      overlay,
      holidayDates: Object.keys(publicHolidayByDate),
    });
  }, [leaveSnapshot, local, filtered, empNo, publicHolidayByDate]);

  const rosterTotals = useMemo(() => {
    const counts = new Map<ValidationRosterLabelCode, number>();
    for (const action of rosterActions) {
      counts.set(action.code, 0);
    }
    let hours = 0;
    for (const row of filtered) {
      for (const action of rosterActions) {
        if (rosterMatchesAction(row.rosterLabel, action)) {
          counts.set(action.code, (counts.get(action.code) ?? 0) + 1);
          break;
        }
      }
      if (row.totalHours != null && Number.isFinite(Number(row.totalHours))) {
        hours += Number(row.totalHours);
      }
    }
    return { counts, hours };
  }, [filtered, rosterActions]);

  const todayKey = useMemo(
    () => calendarDateKeyInTimezone(new Date().toISOString(), timezone),
    [timezone],
  );

  const resolvedWorkingStatus = useMemo(() => {
    if (!selectedEmployee) return null;
    const sorted = [...selectedDates].sort();
    const from = sorted[0];
    const to = sorted[sorted.length - 1];
    const todayRow = todayKey
      ? filtered.find((row) => row.workDate === todayKey)
      : undefined;
    return resolveWorkingStatus({
      workingStatus: selectedEmployee.workingStatus,
      isOffBoarding: Boolean(
        from &&
          to &&
          isOffBoardingForWeek(selectedEmployee.terminationDate, from, to),
      ),
      currentLabelCode:
        todayRow?.rosterLabel?.trim() ||
        selectedEmployee.todayRosterLabel ||
        null,
      weekLabelCodes: filtered
        .map((row) => row.rosterLabel)
        .filter((code): code is string => Boolean(code?.trim())),
    });
  }, [selectedEmployee, selectedDates, filtered, todayKey]);

  const varianceOpts = useMemo(
    () => ({
      varianceMinutes: scheduleVarianceMinutes,
      timezone,
    }),
    [scheduleVarianceMinutes, timezone],
  );

  const selectableKeys = useMemo(
    () =>
      filtered
        .map((row) => {
          const key = draftKey(row.empNo, row.workDate);
          if (key in drafts) return null;
          if (
            selectedEmployee &&
            !isStaffEmployedOnWorkDate(selectedEmployee, row.workDate)
          ) {
            return null;
          }
          return selectionKey(row, varianceOpts);
        })
        .filter((key): key is string => Boolean(key)),
    [filtered, drafts, varianceOpts, selectedEmployee],
  );
  const selectedCount = useMemo(
    () => selectableKeys.filter((key) => selectedIds.has(key)).length,
    [selectableKeys, selectedIds],
  );
  const allSelectableSelected =
    selectableKeys.length > 0 && selectedCount === selectableKeys.length;

  function stageAction(
    row: AttendanceApprovalRow,
    labelCode: ValidationRosterLabelCode,
  ) {
    const key = draftKey(row.empNo, row.workDate);
    // Base (saved) roster — ignore the draft overlay on `row`.
    const savedLabel =
      local.find(
        (r) =>
          r.empNo.trim().toLowerCase() === row.empNo.trim().toLowerCase() &&
          r.workDate === row.workDate,
      )?.rosterLabel ?? null;
    const action = ROSTER_ACTION_DEFS.find((a) => a.code === labelCode);
    const matchesSaved = action
      ? rosterMatchesAction(savedLabel, action)
      : false;

    // Use render-time `drafts` (value set, not functional updater) so Strict
    // Mode cannot double-apply a non-idempotent toggle.
    const hasDraft = key in drafts;
    const staged = hasDraft ? drafts[key] : undefined;
    const visuallySelected =
      (hasDraft && staged === labelCode) || (!hasDraft && matchesSaved);

    const next = { ...drafts };

    // Clicking the currently selected action always unselects it.
    // If the saved roster matches, stage an explicit clear (null) — deleting
    // the draft would just fall back to the saved label and keep the stroke.
    if (visuallySelected) {
      if (matchesSaved) {
        next[key] = null;
      } else {
        delete next[key];
      }
      setDrafts(next);
      return;
    }

    // Select this action (also used after a staged clear).
    next[key] = labelCode;
    setDrafts(next);
  }

  function toggleRowSelected(key: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (
        selectableKeys.length > 0 &&
        selectableKeys.every((key) => prev.has(key))
      ) {
        return new Set();
      }
      return new Set(selectableKeys);
    });
  }

  function saveDrafts() {
    if (!hasDrafts) return;
    setActionError(null);

    const staffByEmp = new Map(
      employees.map((e) => [e.empNo.trim().toLowerCase(), e] as const),
    );

    const changes: {
      staffId: string;
      empNo: string;
      workDate: string;
      labelCode: ValidationRosterLabelCode | null;
    }[] = [];

    for (const [key, labelCode] of draftEntries) {
      const sep = key.indexOf("::");
      if (sep < 0) continue;
      const empKey = key.slice(0, sep);
      const workDate = key.slice(sep + 2);
      const person = staffByEmp.get(empKey);
      const row = local.find(
        (r) =>
          r.empNo.trim().toLowerCase() === empKey && r.workDate === workDate,
      );
      const staffId = row?.staffId ?? person?.id ?? null;
      if (!staffId || !person || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue;
      // Clearing a day that already has no roster is a no-op.
      if (labelCode == null && !row?.rosterLabel) continue;
      changes.push({
        staffId,
        empNo: person.empNo,
        workDate,
        labelCode,
      });
    }

    if (changes.length === 0) return;

    setBusyAction("save");
    startTransition(async () => {
      try {
        const result = await saveValidationRosterDays({
          changes: changes.map(({ staffId, workDate, labelCode }) => ({
            staffId,
            workDate,
            labelCode,
          })),
        });
        if (!("ok" in result) || !result.ok) {
          const message =
            "error" in result && result.error
              ? result.error
              : "Could not save roster edits.";
          window.alert(message);
          setActionError(message);
          return;
        }

        clearAllCachedScheduleDays();

        setLocal((prev) => {
          const byKey = new Map(
            prev.map((r) => [draftKey(r.empNo, r.workDate), r] as const),
          );

          for (const change of changes) {
            const key = draftKey(change.empNo, change.workDate);
            byKey.set(
              key,
              localRowAfterRosterChange(
                byKey.get(key),
                change,
                staffByEmp.get(change.empNo.trim().toLowerCase()),
              ),
            );
          }

          return [...byKey.values()];
        });

        setDrafts({});
        setLeaveRefreshKey((n) => n + 1);
      } catch (err) {
        // Save often succeeded on the server; Next then failed refreshing RSC.
        // Keep the staged edits applied locally so the UI matches the DB.
        if (isNextFlightDigestError(err)) {
          clearAllCachedScheduleDays();
          setLocal((prev) => {
            const byKey = new Map(
              prev.map((r) => [draftKey(r.empNo, r.workDate), r] as const),
            );
            for (const change of changes) {
              const key = draftKey(change.empNo, change.workDate);
              byKey.set(
                key,
                localRowAfterRosterChange(
                  byKey.get(key),
                  change,
                  staffByEmp.get(change.empNo.trim().toLowerCase()),
                ),
              );
            }
            return [...byKey.values()];
          });
          setDrafts({});
          setLeaveRefreshKey((n) => n + 1);
          setActionError(null);
          return;
        }
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Could not save roster edits.";
        window.alert(message);
        setActionError(message);
      } finally {
        setBusyAction(null);
      }
    });
  }

  function approveSelected() {
    const selectedRows = filtered.filter((row) => {
      const key = selectionKey(row, varianceOpts);
      return key != null && selectedIds.has(key);
    });
    if (selectedRows.length === 0) return;
    setActionError(null);

    const ids = selectedRows
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));
    const days = selectedRows
      .filter((row) => !row.id && row.staffId)
      .map((row) => ({
        staffId: row.staffId as string,
        empNo: row.empNo,
        workDate: row.workDate,
      }));

    setBusyAction("approve");
    startTransition(async () => {
      try {
        const result = await approveAttendanceDays({
          ids,
          days,
          approvalStatus: ATTENDANCE_APPROVED_STATUS,
        });
        if (!("ok" in result) || !result.ok) {
          setActionError(
            "error" in result && result.error
              ? result.error
              : "Could not approve attendance.",
          );
          return;
        }

        const byKey = new Map(
          (result.days ?? []).map(
            (day) => [draftKey(day.empNo, day.workDate), day] as const,
          ),
        );
        setLocal((prev) => {
          const next = new Map(
            prev.map((row) => [draftKey(row.empNo, row.workDate), row] as const),
          );
          for (const row of selectedRows) {
            const key = draftKey(row.empNo, row.workDate);
            const approved = byKey.get(key);
            const existing = next.get(key) ?? row;
            next.set(key, {
              ...existing,
              id: approved?.id ?? existing.id,
              staffId: approved?.staffId ?? existing.staffId,
              approvalStatus: ATTENDANCE_APPROVED_STATUS,
            });
          }
          return [...next.values()];
        });
        setSelectedIds(new Set());
      } catch (err) {
        if (isNextFlightDigestError(err)) {
          // Approval likely persisted; update local rows without showing digest.
          setLocal((prev) => {
            const next = new Map(
              prev.map((row) => [draftKey(row.empNo, row.workDate), row] as const),
            );
            for (const row of selectedRows) {
              const key = draftKey(row.empNo, row.workDate);
              const existing = next.get(key) ?? row;
              next.set(key, {
                ...existing,
                approvalStatus: ATTENDANCE_APPROVED_STATUS,
              });
            }
            return [...next.values()];
          });
          setSelectedIds(new Set());
          setActionError(null);
          return;
        }
        setActionError(
          err instanceof Error && err.message
            ? err.message
            : "Could not approve attendance.",
        );
      } finally {
        setBusyAction(null);
      }
    });
  }

  function onDepartmentChange(next: string) {
    const selected = employees.find((e) => e.empNo === empNo);
    // Department only narrows the employee list. Keep the period (weeks/days/
    // payroll) so switching departments does not wipe a chosen range.
    const clearEmp =
      Boolean(next) && Boolean(empNo) && selected?.departmentId !== next;
    patchFilters({
      departmentId: next,
      empNo: clearEmp ? "" : empNo,
    });
    if (clearEmp) {
      setDrafts({});
      setSelectedIds(new Set());
    }
    setActionError(null);
  }

  function onEmployeeChange(next: string) {
    const employee = employees.find((e) => e.empNo === next);
    patchFilters({
      empNo: next,
      ...(employee?.departmentId
        ? { departmentId: employee.departmentId }
        : {}),
    });
    setSelectedIds(new Set());
    setActionError(null);
  }

  function stepEmployee(direction: -1 | 1) {
    const list = employeesByEmpNo;
    if (list.length === 0) return;
    const currentIndex = list.indexOf(empNo);
    const nextIndex =
      currentIndex < 0
        ? direction === 1
          ? 0
          : list.length - 1
        : (currentIndex + direction + list.length) % list.length;
    const next = list[nextIndex];
    if (!next || next === empNo) return;
    if (departmentId) {
      onEmployeeChange(next);
      return;
    }
    patchFilters({ empNo: next });
    setSelectedIds(new Set());
    setActionError(null);
  }

  async function exportCurrentViewPdf() {
    if (!ready || !selectedEmployee || filtered.length === 0) return;
    setActionError(null);
    setExportingPdf(true);
    try {
      const sorted = [...selectedDates].sort();
      const from = sorted[0]!;
      const to = sorted[sorted.length - 1]!;
      const periodLabel = hasWeekFilter
        ? `Weeks · ${formatIsoDateShort(from)} – ${formatIsoDateShort(to)} (${filtered.length} days)`
        : `Period · ${formatIsoDateShort(from)} – ${formatIsoDateShort(to)} (${filtered.length} days)`;

      const departmentName =
        departments.find((d) => d.id === selectedEmployee.departmentId)
          ?.name ??
        departments.find((d) => d.id === departmentId)?.name ??
        null;

      await exportAttendanceValidationPdf({
        venueName,
        venueLogoUrl,
        periodLabel,
        employee: {
          fullName: selectedEmployee.fullName,
          empNo: selectedEmployee.empNo,
          departmentName,
          positionName: selectedEmployee.positionName ?? null,
          joiningDate: selectedEmployee.joiningDate ?? null,
          terminationDate: selectedEmployee.terminationDate ?? null,
        },
        rows: filtered.map((row) => {
          const employedOnDay = isStaffEmployedOnWorkDate(
            selectedEmployee,
            row.workDate,
          );
          const savedRosterLabel =
            local.find(
              (r) =>
                r.empNo.trim().toLowerCase() ===
                  row.empNo.trim().toLowerCase() &&
                r.workDate === row.workDate,
            )?.rosterLabel ?? null;
          const issue = !employedOnDay
            ? savedRosterLabel
              ? "Roster outside employment — clear if incorrect"
              : "Not employed"
            : (row.issue ??
              (row.attendanceStatus && row.attendanceStatus !== "complete"
                ? row.attendanceStatus
                : "—"));
          return {
            workDate: row.workDate,
            rosterLabel: row.rosterLabel ?? "—",
            scheduleTime: row.scheduleTime ?? "—",
            clockIn: formatTime(row.clockIn),
            clockOut: formatTime(row.clockOut),
            hours: formatHoursAsTime(row.totalHours),
            issue,
            approvalStatus: !employedOnDay
              ? "—"
              : approvalStatusLabel(row.approvalStatus),
            isPublicHoliday: Boolean(publicHolidayByDate[row.workDate]),
          };
        }),
        exportedAt: new Date(),
        userDisplayName,
      });
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not export validation PDF.",
      );
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="font-serif text-lg text-[#3D421F]">{heading}</h2>
            <button
              type="button"
              onClick={() => setShowDescription((open) => !open)}
              aria-expanded={showDescription}
              aria-controls="attendance-validation-help"
              title={showDescription ? "Hide help" : "Show help"}
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-black/40 transition-colors hover:bg-black/[0.04] hover:text-[#3D421F]",
                showDescription && "bg-black/[0.04] text-[#3D421F]",
              )}
            >
              <CircleHelp className="h-4 w-4" aria-hidden />
              <span className="sr-only">
                {showDescription ? "Hide help" : "Show help"}
              </span>
            </button>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEditRoster ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || !ready || selectableKeys.length === 0}
                  onClick={toggleSelectAll}
                  className="h-10 px-3"
                >
                  {allSelectableSelected ? "Unselect all" : "Select all"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || selectedCount === 0 || hasDrafts}
                  onClick={approveSelected}
                  className="h-10 px-4"
                  title={
                    hasDrafts
                      ? "Save roster edits before approving attendance"
                      : undefined
                  }
                >
                  {busyAction === "approve"
                    ? "Approving…"
                    : selectedCount > 0
                      ? `Approve Attendance (${selectedCount})`
                      : "Approve Attendance"}
                </Button>
                <Button
                  type="button"
                  disabled={pending || !hasDrafts}
                  onClick={saveDrafts}
                  className="h-10 px-4"
                >
                  {busyAction === "save"
                    ? "Saving…"
                    : hasDrafts
                      ? `Save ${draftCount} edit${draftCount === 1 ? "" : "s"}`
                      : "Save"}
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={
                exportingPdf ||
                pending ||
                !ready ||
                filtered.length === 0 ||
                loadingRange
              }
              onClick={() => {
                void exportCurrentViewPdf();
              }}
              className="h-10 shrink-0 gap-1.5 px-3"
              title={
                !ready
                  ? "Select an employee and period first"
                  : filtered.length === 0
                    ? "No rows in the current view"
                    : "Download PDF of the current validation table"
              }
            >
              <FileText className="h-4 w-4" />
              {exportingPdf ? "Exporting…" : "PDF Export"}
            </Button>
          </div>
        </div>
        {showDescription ? (
          <p
            id="attendance-validation-help"
            className="mt-1 text-sm text-black/55"
          >
            {description}
          </p>
        ) : null}
      </div>

      <div className="w-full border-b border-black/15 pb-3">
      <div className="flex flex-nowrap items-end gap-3 overflow-x-auto pb-0.5">
        <div className="flex min-w-[10rem] w-[12rem] shrink-0 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
            Department
          </span>
          <SearchableSelect
            value={departmentId}
            onChange={onDepartmentChange}
            options={departmentOptions}
            placeholder="All departments"
            searchPlaceholder="Search department…"
          />
        </div>
        <div className="flex min-w-[14rem] w-[18rem] shrink-0 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
            Employee
          </span>
          <SearchableSelect
            value={empNo}
            onChange={onEmployeeChange}
            options={employeeOptions}
            placeholder="Select employee"
            searchPlaceholder="Search emp no or name…"
          />
        </div>
        <div className="flex h-10 shrink-0 items-center gap-1 self-end">
          <button
            type="button"
            title="Previous employee"
            aria-label="Previous employee by employee number"
            disabled={employeesByEmpNo.length === 0}
            onClick={() => stepEmployee(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-[var(--venue-secondary,#F0F3DD)]/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            title="Next employee"
            aria-label="Next employee by employee number"
            disabled={employeesByEmpNo.length === 0}
            onClick={() => stepEmployee(1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-[var(--venue-secondary,#F0F3DD)]/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div
          className={cn(
            "shrink-0",
            !empNo && "pointer-events-none opacity-45",
          )}
        >
          <AttendanceDayRangePicker
            fieldLabel="Days"
            emptyLabel={empNo ? "Select date range" : "Select employee first"}
            startDate={dayStart}
            endDate={dayEnd}
            onChange={({ startDate, endDate }) => {
              setDayRange(startDate, endDate);
              if (startDate || endDate) {
                setSelectedWeekKeys([]);
              }
              setSelectedIds(new Set());
            }}
          />
        </div>
        <div
          className={cn(
            "shrink-0",
            !empNo && "pointer-events-none opacity-45",
          )}
        >
          <AttendanceMultiWeekPicker
            fieldLabel="Weeks"
            emptyLabel={empNo ? "Select week(s)" : "Select employee first"}
            selectedWeekKeys={selectedWeekKeys}
            onChange={(keys) => {
              setSelectedWeekKeys(keys);
              // Weeks and days are alternate period tools — using one clears the other.
              if (keys.length > 0) {
                setDayRange("", "");
              }
              setSelectedIds(new Set());
            }}
          />
        </div>
        <div
          className={cn(
            "shrink-0",
            !empNo && "pointer-events-none opacity-45",
          )}
        >
          <AttendancePayrollMonthPicker
            fieldLabel="Payroll"
            periodStartDay={payrollPeriodStartDay}
            periodEndDay={payrollPeriodEndDay}
            startDate={dayStart}
            endDate={dayEnd}
            onChange={({ startDate, endDate }) => {
              setDayRange(startDate, endDate);
              setSelectedWeekKeys([]);
              setSelectedIds(new Set());
            }}
          />
        </div>
      </div>
      </div>

      {selectedEmployee && !ready ? (
        <div className="flex flex-wrap items-stretch gap-0 overflow-hidden rounded-lg border border-black/10 bg-white/70">
          <StaffPhotoThumbnail
            fullName={selectedEmployee.fullName}
            photoUrl={selectedEmployee.photoUrl}
            size="fill"
            className="ml-[6px] rounded-none border-0"
            empNo={selectedEmployee.empNo}
            department={
              departments.find((d) => d.id === selectedEmployee.departmentId)
                ?.name ?? null
            }
            position={selectedEmployee.positionName}
            employeeStatus={selectedEmployee.employmentStatus}
            workingStatus={resolvedWorkingStatus}
            nationality={selectedEmployee.nationality}
            dob={selectedEmployee.dob}
            joiningDate={selectedEmployee.joiningDate}
            terminationDate={selectedEmployee.terminationDate}
          />
          <div className="flex min-w-[7rem] flex-col items-center gap-0.5 px-3.5 py-2.5 text-center">
            <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
              Emp no
            </span>
            <StaffDirectoryLink
              staffId={selectedEmployee.id}
              empNo={selectedEmployee.empNo}
              title="Open staff directory details"
              className="w-fit text-sm font-medium tabular-nums"
            />
          </div>
          <div
            className="hidden w-px self-stretch bg-black/10 sm:block"
            aria-hidden
          />
          <div className="flex min-w-[6rem] flex-col items-center gap-0.5 px-3.5 py-2.5 text-center">
            <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
              Leave
            </span>
            <Link
              href={`/hr/attendance/leave/balances?staffId=${encodeURIComponent(selectedEmployee.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open leave management for this employee"
              className="w-fit text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 transition hover:underline"
            >
              View
            </Link>
          </div>
          <div
            className="hidden w-px self-stretch bg-black/10 sm:block"
            aria-hidden
          />
          <div className="flex min-w-[8rem] flex-col items-center gap-0.5 px-3.5 py-2.5 text-center">
            <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-black/45">
              Employment status
            </span>
            <StatusBadge status={selectedEmployee.employmentStatus} />
          </div>
          <div
            className="hidden w-px self-stretch bg-black/10 sm:block"
            aria-hidden
          />
          <div className="flex min-w-[8rem] flex-col items-center gap-0.5 px-3.5 py-2.5 text-center">
            <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-black/45">
              Working status
            </span>
            <WorkingStatusBadge status={resolvedWorkingStatus} />
          </div>
          <div
            className="hidden w-px self-stretch bg-black/10 sm:block"
            aria-hidden
          />
          <TenureMetrics
            employmentDuration={employmentDuration}
            workTime={workTime}
            workTimeLoading={leaveLoading}
            className="min-w-[16rem] px-3.5 py-2.5"
          />
          <div
            className="hidden w-px self-stretch bg-black/10 sm:block"
            aria-hidden
          />
          <LeaveBalanceTriple
            title="APL"
            loading={leaveLoading}
            eligible={liveLeave?.alEligible ?? null}
            left={liveLeave?.alLeft ?? null}
            taken={liveLeave?.alTaken ?? null}
            className="min-w-[10rem] px-3.5 py-2.5"
          />
          <div
            className="hidden w-px self-stretch bg-black/10 sm:block"
            aria-hidden
          />
          <LeaveBalanceTriple
            title="PH"
            loading={leaveLoading}
            eligible={liveLeave?.phEligible ?? null}
            left={liveLeave?.phLeft ?? null}
            taken={liveLeave?.phTaken ?? null}
            className="min-w-[10rem] px-3.5 py-2.5"
          />
        </div>
      ) : null}

      {actionError ? (
        <p className="text-sm text-rose-800" role="alert">
          {actionError}
        </p>
      ) : null}

      {!ready ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
          <p className="text-sm text-black/55">
            Select a department, then an employee, then weeks or a date range to
            load validation results. Stage actions on days, Save, then select
            rows and Approve Attendance for payroll and leave.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "w-full min-w-0 space-y-3",
            loadingRange && "opacity-60",
          )}
          aria-busy={loadingRange}
        >
          {selectedEmployee ? (
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
              <table className="w-full table-fixed text-left text-sm">
                <AttendanceTableColgroup />
                <thead>
                  <tr className="bg-white/70 text-center text-sm font-normal normal-case tracking-normal text-[#3D421F]">
                  <th colSpan={3} className="p-0 font-normal">
                    <div className="flex h-full min-w-0 items-stretch">
                      <StaffPhotoThumbnail
                        fullName={selectedEmployee.fullName}
                        photoUrl={selectedEmployee.photoUrl}
                        size="fill"
                        className="ml-[6px] rounded-none border-0"
                        empNo={selectedEmployee.empNo}
                        department={
                          departments.find(
                            (d) => d.id === selectedEmployee.departmentId,
                          )?.name ?? null
                        }
                        position={selectedEmployee.positionName}
                        employeeStatus={selectedEmployee.employmentStatus}
                        workingStatus={resolvedWorkingStatus}
                        nationality={selectedEmployee.nationality}
                        dob={selectedEmployee.dob}
                        joiningDate={selectedEmployee.joiningDate}
                        terminationDate={selectedEmployee.terminationDate}
                      />
                      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-center">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
                          Emp no
                        </span>
                        <StaffDirectoryLink
                          staffId={selectedEmployee.id}
                          empNo={selectedEmployee.empNo}
                          title="Open staff directory details"
                          className="w-fit text-sm font-medium tabular-nums"
                        />
                      </div>
                      <div
                        className="hidden w-px self-stretch bg-black/10 sm:block"
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-center">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
                          Leave
                        </span>
                        <Link
                          href={`/hr/attendance/leave/balances?staffId=${encodeURIComponent(selectedEmployee.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open leave management for this employee"
                          className="w-fit text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 transition hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  </th>
                  <th
                    colSpan={2}
                    className="border-x border-black/10 px-3 py-2.5 font-normal align-top"
                  >
                    <div className="flex flex-col items-center gap-0.5 text-center">
                      <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-black/45">
                        Employment status
                      </span>
                      <StatusBadge
                        status={selectedEmployee.employmentStatus}
                      />
                    </div>
                  </th>
                  <th
                    colSpan={1}
                    className="border-x border-black/10 px-3 py-2.5 font-normal align-top"
                  >
                    <div className="flex flex-col items-center gap-0.5 text-center">
                      <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-black/45">
                        Working status
                      </span>
                      <WorkingStatusBadge status={resolvedWorkingStatus} />
                    </div>
                  </th>
                  <th colSpan={3} className="p-0 font-normal align-top">
                    <div className="flex h-full min-w-0 items-stretch">
                      <TenureMetrics
                        employmentDuration={employmentDuration}
                        workTime={workTime}
                        workTimeLoading={leaveLoading}
                        className="min-w-[14rem] flex-[1.35] px-3 py-2.5"
                      />
                      <div
                        className="hidden w-px shrink-0 self-stretch bg-black/10 sm:block"
                        aria-hidden
                      />
                      <LeaveBalanceTriple
                        title="APL"
                        loading={leaveLoading}
                        eligible={liveLeave?.alEligible ?? null}
                        left={liveLeave?.alLeft ?? null}
                        taken={liveLeave?.alTaken ?? null}
                        className="px-3 py-2.5"
                      />
                      <div
                        className="hidden w-px shrink-0 self-stretch bg-black/10 sm:block"
                        aria-hidden
                      />
                      <LeaveBalanceTriple
                        title="PH"
                        loading={leaveLoading}
                        eligible={liveLeave?.phEligible ?? null}
                        left={liveLeave?.phLeft ?? null}
                        taken={liveLeave?.phTaken ?? null}
                        className="px-3 py-2.5"
                      />
                    </div>
                  </th>
                </tr>
                </thead>
              </table>
            </div>
          ) : null}
          <div className="@container overflow-hidden rounded-xl border border-black/10 bg-white/70">
            <table className="w-full table-fixed text-left text-sm">
              <AttendanceTableColgroup />
              <thead className="border-b border-black/10">
              <tr className="sticky top-0 z-10 bg-white/95 text-xs uppercase tracking-wide text-black/45 backdrop-blur-sm">
                <th className="w-[5.5rem] whitespace-nowrap px-3 py-2.5 font-medium">
                  Date
                </th>
                <th className="w-[4.5rem] whitespace-nowrap px-3 py-2.5 font-medium">
                  Roster
                </th>
                <th className="w-[7rem] whitespace-nowrap px-3 py-2.5 font-medium">
                  Schedule
                </th>
                <th className="w-[5rem] whitespace-nowrap bg-black/[0.07] px-3 py-2.5 font-medium">
                  Clock in
                </th>
                <th className="w-[5.5rem] whitespace-nowrap bg-black/[0.07] px-3 py-2.5 font-medium">
                  Clock out
                </th>
                <th className="w-[7rem] whitespace-nowrap px-3 py-2.5 font-medium">
                  Hours
                </th>
                <th className="w-[10rem] px-3 py-2.5 font-medium">
                  Issue
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <span className="normal-case tracking-normal @min-[72rem]:hidden">
                    Actions
                  </span>
                  <div className="hidden flex-wrap items-center gap-x-2 gap-y-1.5 normal-case tracking-normal @min-[72rem]:flex">
                    {rosterActionGroups.map((group, groupIndex) => (
                      <div
                        key={group.id}
                        className="flex items-center gap-1.5"
                      >
                        {groupIndex > 0 ? (
                          <span
                            className="mx-0.5 hidden h-4 w-px shrink-0 self-center bg-black/15 sm:block"
                            aria-hidden
                          />
                        ) : null}
                        <div className="w-max">
                          <span className="block text-left">{group.label}</span>
                          <ActionGroupWidthSizer
                            codes={group.actions.map((action) => action.code)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </th>
                <th className="w-[3.25rem] whitespace-nowrap px-3 py-2.5 text-center font-medium">
                  <span className="sr-only">Select</span>
                  {canEditRoster && selectableKeys.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            selectedCount > 0 && !allSelectableSelected;
                        }
                      }}
                      onChange={toggleSelectAll}
                      disabled={pending}
                      aria-label={
                        allSelectableSelected
                          ? "Unselect all rows"
                          : "Select all rows"
                      }
                      className="h-4 w-4 rounded border-black/25 text-[var(--venue-primary)] focus:ring-[var(--venue-primary)]/30"
                    />
                  ) : null}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const staffId = row.staffId ?? selectedEmployee?.id ?? null;
                const key = draftKey(row.empNo, row.workDate);
                const hasDraft = key in drafts;
                const draft = hasDraft ? drafts[key] : undefined;
                const employedOnDay = selectedEmployee
                  ? isStaffEmployedOnWorkDate(selectedEmployee, row.workDate)
                  : false;
                const weekEnd = isSundayIso(row.workDate);
                const isToday = Boolean(todayKey) && row.workDate === todayKey;
                const holidayName = publicHolidayByDate[row.workDate] ?? null;
                const isPublicHoliday = Boolean(holidayName);
                const isApproved = row.approvalStatus === ATTENDANCE_APPROVED_STATUS;
                const rowSelectionKey =
                  !hasDraft && employedOnDay
                    ? selectionKey(row, varianceOpts)
                    : null;
                const canSelect = Boolean(rowSelectionKey);
                const isSelected = Boolean(
                  rowSelectionKey && selectedIds.has(rowSelectionKey),
                );
                const shiftWithinTolerance =
                  row.rosterLabel === "SHIFT" &&
                  Boolean(row.id) &&
                  !shiftNeedsApproval({
                    rosterLabel: row.rosterLabel,
                    workDate: row.workDate,
                    scheduleStart: row.scheduleStartTime ?? null,
                    scheduleEnd: row.scheduleEndTime ?? null,
                    clockIn: row.clockIn,
                    clockOut: row.clockOut,
                    timezone,
                    varianceMinutes: scheduleVarianceMinutes,
                  });
                const savedRosterLabel =
                  local.find(
                    (r) =>
                      r.empNo.trim().toLowerCase() ===
                        row.empNo.trim().toLowerCase() &&
                      r.workDate === row.workDate,
                  )?.rosterLabel ?? null;
                const canClearOutsideEmployment =
                  !employedOnDay &&
                  canEditRoster &&
                  Boolean(staffId) &&
                  (savedRosterLabel != null || draft === null);
                const selectedAction = resolveSelectedRosterAction(
                  row,
                  draft,
                  hasDraft,
                  rosterActionGroups.flatMap((group) => group.actions),
                );
                return (
                  <tr
                    key={`${row.empNo}-${row.workDate}`}
                    title={
                      !employedOnDay
                        ? "Not employed on this date — actions unavailable"
                        : holidayName
                          ? `${holidayName} · Public holiday`
                          : isToday
                            ? "Today"
                            : undefined
                    }
                    className={cn(
                      "hover:bg-black/[0.02]",
                      !employedOnDay && "opacity-70",
                      hasDraft
                        ? "bg-[var(--venue-secondary)]/25"
                        : isPublicHoliday
                          ? "bg-[#ede9fe]/45"
                          : isToday && "bg-orange-50",
                      isSelected && "bg-[var(--venue-primary)]/[0.06]",
                      weekEnd
                        ? "[&>td]:border-b-2 [&>td]:border-black/40"
                        : "[&>td]:border-b [&>td]:border-black/5",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={cn(
                          isPublicHoliday && "font-medium text-[#5b21b6]",
                          isToday &&
                            !isPublicHoliday &&
                            "font-semibold text-orange-700",
                        )}
                      >
                        {formatIsoDateShort(row.workDate)}
                      </span>
                      {isPublicHoliday ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-[#5b21b6]">
                          · PH
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.rosterLabel ?? "—"}
                      {hasDraft ? "*" : ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {row.scheduleTime ?? "—"}
                    </td>
                    <td className="whitespace-nowrap bg-black/[0.07] px-3 py-2">
                      {formatTime(row.clockIn)}
                    </td>
                    <td className="whitespace-nowrap bg-black/[0.07] px-3 py-2">
                      {formatTime(row.clockOut)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatHoursAsTime(row.totalHours)}
                    </td>
                    <td className="px-3 py-2 text-xs text-amber-900">
                      {!employedOnDay && savedRosterLabel
                        ? "Roster outside employment — clear if incorrect"
                        : (row.issue ??
                          (row.attendanceStatus &&
                          row.attendanceStatus !== "complete"
                            ? row.attendanceStatus
                            : "—"))}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        {!canEditRoster || !staffId ? (
                          <span className="text-xs text-black/40">—</span>
                        ) : !employedOnDay ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="text-xs text-black/45"
                              title="Joining/termination window — no validation actions"
                            >
                              Not employed
                            </span>
                            {canClearOutsideEmployment ? (
                              <button
                                type="button"
                                disabled={pending}
                                title={
                                  draft === null
                                    ? "Undo clear — click Save to keep current roster"
                                    : "Clear erroneous roster for a day outside employment"
                                }
                                onClick={() => {
                                  const next = { ...drafts };
                                  if (key in next && next[key] === null) {
                                    delete next[key];
                                  } else {
                                    next[key] = null;
                                  }
                                  setDrafts(next);
                                }}
                                className={cn(
                                  "inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-45",
                                  draft === null
                                    ? "border-2 border-black bg-white text-black"
                                    : "border-black/20 bg-white/80 text-black/70",
                                )}
                              >
                                {draft === null ? "Clear*" : "Clear"}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <div className="hidden flex-wrap items-center gap-x-2 gap-y-1.5 @min-[72rem]:flex">
                          {rosterActionGroups.map((group, groupIndex) => (
                            <div
                              key={group.id}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              {groupIndex > 0 ? (
                                <span
                                  className="mx-0.5 hidden h-6 w-px shrink-0 self-center bg-black/15 sm:block"
                                  aria-hidden
                                />
                              ) : null}
                              <div
                                className="flex flex-wrap items-center gap-1.5"
                                role="group"
                                aria-label={group.label}
                              >
                                {group.actions.map((action) => {
                                  const selected =
                                    draft === action.code ||
                                    (draft === undefined &&
                                      rosterMatchesAction(
                                        row.rosterLabel,
                                        action,
                                      ));
                                  const label = labelsByCode.get(
                                    action.rosterCode,
                                  );
                                  const phReplOnHoliday =
                                    action.code === "PH-REPL" &&
                                    isPublicHoliday;
                                  const tooltip = phReplOnHoliday
                                    ? "Calendar public holiday — use OFF (holiday taken) or SH (work to earn a PH-REPL credit). PH-REPL is for taking a banked day on a normal date."
                                    : selected
                                      ? `Click again to unselect ${action.code}`
                                      : action.code === "SH"
                                        ? isPublicHoliday
                                          ? `${label?.name ?? action.fallbackTitle} — work on this holiday to earn +1 PH-REPL credit`
                                          : `${label?.name ?? action.fallbackTitle} — counted for payroll, hours unchanged`
                                        : action.code === "OFF"
                                          ? isPublicHoliday
                                            ? "Public holiday taken (saves as PH on this calendar holiday)"
                                            : `${label?.name ?? action.fallbackTitle} — paid day off`
                                          : (label?.name ??
                                            action.fallbackTitle);
                                  return (
                                    <button
                                      key={action.code}
                                      type="button"
                                      title={tooltip}
                                      aria-label={tooltip}
                                      aria-pressed={selected}
                                      disabled={pending || phReplOnHoliday}
                                      onClick={() =>
                                        stageAction(row, action.code)
                                      }
                                      className={cn(
                                        "inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md border px-2 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-45",
                                        selected && "border-2",
                                      )}
                                      style={
                                        label
                                          ? {
                                              ...scheduleDayLabelStyle(label),
                                              ...(selected
                                                ? {
                                                    borderColor: "#000000",
                                                    boxShadow:
                                                      "0 0 0 1px #000000",
                                                  }
                                                : {}),
                                            }
                                          : {
                                              backgroundColor: "#f5f5f5",
                                              color: "#404040",
                                              borderColor: selected
                                                ? "#000000"
                                                : "#d4d4d4",
                                              ...(selected
                                                ? {
                                                    boxShadow:
                                                      "0 0 0 1px #000000",
                                                  }
                                                : {}),
                                            }
                                      }
                                    >
                                      {action.code}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                            </div>
                            <div className="min-w-0 @min-[72rem]:hidden">
                              <RosterActionDropdown
                                groups={rosterActionGroups}
                                labelsByCode={labelsByCode}
                                selectedAction={selectedAction}
                                isPublicHoliday={isPublicHoliday}
                                disabled={pending}
                                onSelect={(code) => stageAction(row, code)}
                                onClear={() => {
                                  if (selectedAction) {
                                    stageAction(row, selectedAction.code);
                                  }
                                }}
                              />
                            </div>
                          </>
                        )}
                        {hasDraft ? (
                          <span
                            data-roster-draft-badge
                            className="ml-auto text-[10px] font-medium uppercase tracking-wide text-[var(--venue-primary)]"
                          >
                            draft
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {canSelect && rowSelectionKey ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={pending || !canEditRoster}
                            onChange={() => toggleRowSelected(rowSelectionKey)}
                            aria-label={`Select ${formatIsoDateShort(row.workDate)} for approval`}
                            className="h-4 w-4 shrink-0 rounded border-black/25 text-[var(--venue-primary)] focus:ring-[var(--venue-primary)]/30"
                          />
                        ) : (
                          <span
                            className="inline-block h-4 w-4 shrink-0 rounded border border-dashed border-black/15"
                            title={
                              !employedOnDay
                                ? "Not employed on this date — no approval"
                                : hasDraft
                                  ? "Save roster edits before approving"
                                  : row.rosterLabel === "OFF" ||
                                      row.rosterLabel === "PH"
                                    ? "Day off — no approval needed"
                                    : shiftWithinTolerance
                                      ? `Within ${scheduleVarianceMinutes} min of schedule — no approval needed`
                                      : row.rosterLabel === "SHIFT" && !row.id
                                        ? "Mark ABS (or leave) and Save before approving a no-show"
                                        : "Set a roster action (e.g. ABS) and Save before approving"
                            }
                            aria-hidden
                          />
                        )}
                        {isApproved && !hasDraft ? (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                            approved
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 ? (
              <tfoot>
                <tr className="border-t border-neutral-800 bg-neutral-700 text-sm text-white [&>td]:bg-neutral-700">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-white/45">—</td>
                  <td className="px-3 py-2.5 text-white/45">—</td>
                  <td className="px-3 py-2.5 text-white/45">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-white/45">
                    —
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums">
                    {formatHoursAsTime(rosterTotals.hours)}
                  </td>
                  <td className="px-3 py-2.5 text-white/45">—</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      {rosterActionGroups.map((group, groupIndex) => (
                        <div
                          key={group.id}
                          className="flex flex-wrap items-center gap-1.5"
                        >
                          {groupIndex > 0 ? (
                            <span
                              className="mx-0.5 hidden h-6 w-px shrink-0 self-center bg-black/15 sm:block"
                              aria-hidden
                            />
                          ) : null}
                          <div
                            className="flex flex-wrap items-center gap-1.5"
                            role="group"
                            aria-label={`${group.label} totals`}
                          >
                            {group.actions.map((action) => {
                              const count =
                                rosterTotals.counts.get(action.code) ?? 0;
                              const label = labelsByCode.get(action.rosterCode);
                              return (
                                <span
                                  key={action.code}
                                  title={`${action.code}: ${count}`}
                                  className={cn(
                                    ACTION_CHIP_SIZING,
                                    "relative shrink-0",
                                  )}
                                  style={
                                    label
                                      ? scheduleDayLabelStyle(label)
                                      : {
                                          backgroundColor: "#f5f5f5",
                                          color: "#404040",
                                          borderColor: "#d4d4d4",
                                        }
                                  }
                                >
                                  <span className="invisible" aria-hidden>
                                    {action.code}
                                  </span>
                                  <span className="absolute inset-0 flex items-center justify-center tabular-nums">
                                    {count}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            ) : null}
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
