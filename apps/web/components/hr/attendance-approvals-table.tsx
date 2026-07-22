"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AttendanceMultiWeekPicker,
  mondayKeyForWorkDate,
} from "@/components/hr/attendance-date-filters";
import { usePersistedHrAttendanceValidationFilters } from "@/components/hr/use-persisted-hr-filters";
import {
  approveAttendanceDays,
  loadAttendanceValidationRowsForRange,
  saveValidationRosterDays,
  type ValidationRosterLabelCode,
} from "@/lib/actions/hr-attendance";
import { ATTENDANCE_APPROVED_STATUS } from "@/lib/hr/attendance-approval";
import { isScheduleLeaveLabel } from "@/lib/hr/leave";
import {
  DEFAULT_SCHEDULE_VARIANCE_MINUTES,
  shiftNeedsApproval,
} from "@/lib/hr/schedule-variance";
import { clearAllCachedScheduleDays } from "@/lib/hr/schedules-client-cache";
import { scheduleDayLabelStyle, formatIsoDateShort } from "@/lib/hr/schedules";
import { DEFAULT_HR_ATTENDANCE_IMPORT_RULES } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

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
};

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
  /** Grace minutes between schedule and punches (default 40). */
  scheduleVarianceMinutes?: number;
  timezone?: string;
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
  { id: "duty", label: "Duty" },
  { id: "paid", label: "Paid leave" },
  { id: "unpaid", label: "Unpaid" },
];

/**
 * Validation actions in three groups:
 * 1. Duty — SH / OFF / PH-REPL
 * 2. Paid leave — AL / SL / ML / PL / BL
 * 3. Unpaid — UPL / ABS
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
  { code: "ABS", rosterCode: "ABS", fallbackTitle: "Absence", group: "unpaid" },
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

function rosterCodeForAction(code: ValidationRosterLabelCode): string {
  return code === "SH" ? "SHIFT" : code;
}

function draftKey(empNo: string, workDate: string): string {
  return `${empNo.trim().toLowerCase()}::${workDate}`;
}

/** Roster labels that never need Validation approval (paid rest days). */
const NO_APPROVAL_ROSTER_LABELS = new Set(["OFF", "PH"]);

function isLeaveOrAbsenceLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return isScheduleLeaveLabel(label) || label === "ABS";
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
  // Day off / calendar holiday taken — no payroll decision.
  if (row.rosterLabel && NO_APPROVAL_ROSTER_LABELS.has(row.rosterLabel)) {
    return null;
  }

  // Leave / ABS always need approval (even without punches).
  if (isLeaveOrAbsenceLabel(row.rosterLabel)) {
    if (row.id) return `id:${row.id}`;
    if (row.staffId) return `day:${draftKey(row.empNo, row.workDate)}`;
    return null;
  }

  // SHIFT: only when punches are missing or differ from schedule beyond grace.
  if (row.rosterLabel === "SHIFT") {
    const needs = shiftNeedsApproval({
      rosterLabel: row.rosterLabel,
      workDate: row.workDate,
      scheduleStart: row.scheduleStartTime ?? null,
      scheduleEnd: row.scheduleEndTime ?? null,
      clockIn: row.clockIn,
      clockOut: row.clockOut,
      timezone:
        opts?.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
      varianceMinutes:
        opts?.varianceMinutes ??
        DEFAULT_HR_ATTENDANCE_IMPORT_RULES.scheduleVarianceMinutes,
    });
    if (!needs) return null;
    if (row.id) return `id:${row.id}`;
    // No attendance row yet (e.g. incomplete) — not selectable until punches exist
    // or the day is reclassified (ABS / leave).
    return null;
  }

  // Other punch rows (e.g. attendance with no roster) still need a review.
  if (row.id) return `id:${row.id}`;
  return null;
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

export function AttendanceApprovalsTable({
  rows,
  departments,
  employees,
  scheduleLabels,
  publicHolidayByDate = {},
  canEditRoster,
  initialStaffId = null,
  scheduleVarianceMinutes = DEFAULT_SCHEDULE_VARIANCE_MINUTES,
  timezone = DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"save" | "approve" | null>(
    null,
  );
  const [local, setLocal] = useState(rows);
  const {
    departmentId,
    empNo,
    selectedWeekKeys,
    hydrated,
    setDepartmentId,
    setEmpNo,
    setSelectedWeekKeys,
    patchFilters,
  } = usePersistedHrAttendanceValidationFilters();
  /** Staged roster actions keyed by empNo::workDate — saved together. */
  const [drafts, setDrafts] = useState<
    Record<string, ValidationRosterLabelCode>
  >({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingRange, setLoadingRange] = useState(false);
  const appliedInitialStaffRef = useRef<string | null>(null);

  const weekRangeKey = useMemo(
    () => [...selectedWeekKeys].sort().join(","),
    [selectedWeekKeys],
  );

  useEffect(() => {
    if (!hydrated) return;
    const staffId = initialStaffId?.trim();
    if (!staffId) return;
    if (appliedInitialStaffRef.current === staffId) return;
    const employee = employees.find((e) => e.id === staffId);
    if (!employee?.departmentId) return;
    appliedInitialStaffRef.current = staffId;
    patchFilters({
      departmentId: employee.departmentId,
      empNo: employee.empNo,
    });
  }, [hydrated, initialStaffId, employees, patchFilters]);

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
    if (!departmentId) return [];
    return employees
      .filter((e) => e.departmentId === departmentId)
      .map((employee) => ({
        value: employee.empNo,
        label: `${employee.fullName} (${employee.empNo})`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees, departmentId]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.empNo === empNo),
    [employees, empNo],
  );

  const weekKeySet = useMemo(
    () => new Set(selectedWeekKeys),
    [selectedWeekKeys],
  );

  const ready = Boolean(departmentId && empNo && selectedWeekKeys.length > 0);

  useEffect(() => {
    if (!ready || !empNo || selectedWeekKeys.length === 0) {
      setLoadingRange(false);
      return;
    }

    const dates = datesForWeekKeys(selectedWeekKeys);
    if (dates.length === 0) return;
    const sorted = [...dates].sort();
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
            if (row.departmentId !== departmentId) continue;
            byKey.set(draftKey(row.empNo, row.workDate), row);
          }
          return [...byKey.values()];
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [ready, empNo, departmentId, weekRangeKey, selectedWeekKeys]);

  const draftEntries = useMemo(() => Object.entries(drafts), [drafts]);
  const draftCount = draftEntries.length;
  const hasDrafts = draftCount > 0;

  const filtered = useMemo(() => {
    if (!ready || !selectedEmployee) return [];

    const empKey = empNo.trim().toLowerCase();
    const byDate = new Map<string, AttendanceApprovalRow>();

    for (const row of local) {
      if (row.empNo.trim().toLowerCase() !== empKey) continue;
      if (row.departmentId !== departmentId) continue;
      const mondayKey = mondayKeyForWorkDate(row.workDate);
      if (!mondayKey || !weekKeySet.has(mondayKey)) continue;
      byDate.set(row.workDate, row);
    }

    return datesForWeekKeys(selectedWeekKeys).map((workDate) => {
      const base =
        byDate.get(workDate) ??
        emptyRowForDay({
          staffId: selectedEmployee.id,
          workDate,
          empNo,
          fullName: selectedEmployee.fullName,
          departmentId,
        });
      const draft = drafts[draftKey(empNo, workDate)];
      if (!draft) return base;

      return {
        ...base,
        rosterLabel: rosterCodeForAction(draft),
        scheduleTime: null,
        issue: issueAfterRosterLabel(draft, base.clockIn, base.clockOut),
      };
    });
  }, [
    local,
    ready,
    empNo,
    departmentId,
    weekKeySet,
    selectedWeekKeys,
    selectedEmployee,
    drafts,
  ]);

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
          if (drafts[key]) return null;
          return selectionKey(row, varianceOpts);
        })
        .filter((key): key is string => Boolean(key)),
    [filtered, drafts, varianceOpts],
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
    setDrafts((prev) => {
      const next = { ...prev };
      // Clicking the same staged action again clears the draft for that day.
      if (next[key] === labelCode) {
        delete next[key];
        return next;
      }
      next[key] = labelCode;
      return next;
    });
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
      labelCode: ValidationRosterLabelCode;
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
            const existing = byKey.get(key);
            const person = staffByEmp.get(change.empNo.trim().toLowerCase());
            byKey.set(key, {
              ...(existing ??
                emptyRowForDay({
                  staffId: change.staffId,
                  workDate: change.workDate,
                  empNo: change.empNo,
                  fullName: person?.fullName ?? change.empNo,
                  departmentId: person?.departmentId ?? null,
                })),
              staffId: change.staffId,
              rosterLabel: rosterCodeForAction(change.labelCode),
              scheduleTime: null,
              issue: issueAfterRosterLabel(
                change.labelCode,
                existing?.clockIn ?? null,
                existing?.clockOut ?? null,
              ),
            });
          }

          return [...byKey.values()];
        });

        setDrafts({});
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
              const existing = byKey.get(key);
              const person = staffByEmp.get(change.empNo.trim().toLowerCase());
              byKey.set(key, {
                ...(existing ??
                  emptyRowForDay({
                    staffId: change.staffId,
                    workDate: change.workDate,
                    empNo: change.empNo,
                    fullName: person?.fullName ?? change.empNo,
                    departmentId: person?.departmentId ?? null,
                  })),
                staffId: change.staffId,
                rosterLabel: rosterCodeForAction(change.labelCode),
                scheduleTime: null,
                issue: issueAfterRosterLabel(
                  change.labelCode,
                  existing?.clockIn ?? null,
                  existing?.clockOut ?? null,
                ),
              });
            }
            return [...byKey.values()];
          });
          setDrafts({});
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
    setDepartmentId(next);
    setEmpNo("");
    setSelectedWeekKeys([]);
    setDrafts({});
    setSelectedIds(new Set());
    setActionError(null);
  }

  function onEmployeeChange(next: string) {
    setEmpNo(next);
    setSelectedIds(new Set());
    setActionError(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:max-w-[16rem]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
            1. Department
          </span>
          <SearchableSelect
            value={departmentId}
            onChange={onDepartmentChange}
            options={departmentOptions}
            placeholder="Select department"
            searchPlaceholder="Search department…"
          />
        </div>
        <div
          className={cn(
            "flex min-w-[14rem] flex-1 flex-col gap-1 sm:max-w-[20rem]",
            !departmentId && "pointer-events-none opacity-45",
          )}
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
            2. Employee
          </span>
          <SearchableSelect
            value={empNo}
            onChange={onEmployeeChange}
            options={employeeOptions}
            placeholder={
              departmentId ? "Select employee" : "Select department first"
            }
            searchPlaceholder="Search employee…"
          />
        </div>
        <div
          className={cn(
            "shrink-0",
            !empNo && "pointer-events-none opacity-45",
          )}
        >
          <AttendanceMultiWeekPicker
            fieldLabel="3. Weeks"
            emptyLabel={empNo ? "Select week(s)" : "Select employee first"}
            selectedWeekKeys={selectedWeekKeys}
            onChange={(keys) => {
              setSelectedWeekKeys(keys);
              setSelectedIds(new Set());
            }}
          />
        </div>
        {canEditRoster ? (
          <div className="ml-auto flex shrink-0 items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-transparent">
                Select
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !ready || selectableKeys.length === 0}
                onClick={toggleSelectAll}
                className="h-10 px-3"
              >
                {allSelectableSelected ? "Unselect all" : "Select all"}
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-transparent">
                Approve
              </span>
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
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-transparent">
                Save
              </span>
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
            </div>
          </div>
        ) : null}
      </div>

      {actionError ? (
        <p className="text-sm text-rose-800" role="alert">
          {actionError}
        </p>
      ) : null}

      {!ready ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
          <p className="text-sm text-black/55">
            Select a department, then an employee, then one or more weeks to
            load validation results. Stage actions on days, Save, then select
            rows and Approve Attendance for payroll and leave.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "h-fit w-max max-w-full max-h-[calc(100dvh-18rem)] overflow-auto overscroll-contain rounded-xl border border-black/10 bg-white/70",
            loadingRange && "opacity-60",
          )}
          aria-busy={loadingRange}
        >
          <table className="w-max text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-black/10 bg-white/95 text-xs uppercase tracking-wide text-black/45 backdrop-blur-sm">
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Date
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Roster
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Schedule
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Clock in
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Clock out
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Hours
                </th>
                <th className="w-[14rem] min-w-[9rem] max-w-[14rem] px-3 py-2.5 font-medium">
                  Issue
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Actions
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">
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
                const draft = drafts[key];
                const hasDraft = Boolean(draft);
                const weekEnd = isSundayIso(row.workDate);
                const holidayName = publicHolidayByDate[row.workDate] ?? null;
                const isPublicHoliday = Boolean(holidayName);
                const isApproved = row.approvalStatus === ATTENDANCE_APPROVED_STATUS;
                const rowSelectionKey = !hasDraft
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
                return (
                  <tr
                    key={`${row.empNo}-${row.workDate}`}
                    title={
                      holidayName
                        ? `${holidayName} · Public holiday`
                        : undefined
                    }
                    className={cn(
                      "hover:bg-black/[0.02]",
                      isPublicHoliday
                        ? "bg-[#ede9fe]/45"
                        : hasDraft && "bg-[var(--venue-secondary)]/25",
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
                        )}
                      >
                        {formatIsoDateShort(row.workDate)}
                      </span>
                      {isPublicHoliday ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-[#5b21b6]">
                          · PH
                        </span>
                      ) : null}
                      {hasDraft ? (
                        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-[var(--venue-primary)]">
                          draft
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
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatTime(row.clockIn)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatTime(row.clockOut)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.totalHours == null
                        ? "—"
                        : Number(row.totalHours).toFixed(2)}
                    </td>
                    <td className="max-w-[14rem] px-3 py-2 text-xs text-amber-900">
                      {row.issue ??
                        (row.attendanceStatus &&
                        row.attendanceStatus !== "complete"
                          ? row.attendanceStatus
                          : "—")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-nowrap items-center gap-x-2">
                        {canEditRoster && staffId
                          ? rosterActionGroups.map((group, groupIndex) => (
                              <div
                                key={group.id}
                                className="flex flex-nowrap items-center gap-1.5"
                              >
                                {groupIndex > 0 ? (
                                  <span
                                    className="mx-0.5 hidden h-6 w-px shrink-0 bg-black/15 sm:block"
                                    aria-hidden
                                  />
                                ) : null}
                                <div
                                  className="flex flex-nowrap items-center gap-1.5"
                                  role="group"
                                  aria-label={group.label}
                                >
                                  {group.actions.map((action) => {
                                    const selected =
                                      draft === action.code ||
                                      (!draft &&
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
                            ))
                          : (
                            <span className="text-xs text-black/40">—</span>
                          )}
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
                              hasDraft
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
                        {isApproved ? (
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
          </table>
        </div>
      )}
    </div>
  );
}
