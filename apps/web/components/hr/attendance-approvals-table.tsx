"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AttendanceMultiWeekPicker,
  mondayKeyForWorkDate,
} from "@/components/hr/attendance-date-filters";
import {
  saveValidationRosterDays,
  type ValidationRosterLabelCode,
} from "@/lib/actions/hr-attendance";
import { clearAllCachedScheduleDays } from "@/lib/hr/schedules-client-cache";
import { scheduleDayLabelStyle } from "@/lib/hr/schedules";
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
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number | null;
  attendanceStatus: string | null;
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
};

const ROSTER_ACTIONS: {
  code: ValidationRosterLabelCode;
  /** Roster label_code stored when this action is applied. */
  rosterCode: string;
  /** Fallback tooltip if schedule settings label is missing. */
  fallbackTitle: string;
}[] = [
  {
    code: "SH",
    rosterCode: "SHIFT",
    fallbackTitle: "Working shift (payroll, hours unchanged)",
  },
  { code: "ABS", rosterCode: "ABS", fallbackTitle: "Absence" },
  { code: "PH", rosterCode: "PH", fallbackTitle: "Public holiday" },
  { code: "AL", rosterCode: "AL", fallbackTitle: "Annual leave" },
  { code: "SL", rosterCode: "SL", fallbackTitle: "Sick leave" },
  { code: "UPL", rosterCode: "UPL", fallbackTitle: "Unpaid leave" },
];

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
    clockIn: null,
    clockOut: null,
    totalHours: null,
    attendanceStatus: null,
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
}: Props) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(rows);
  const [departmentId, setDepartmentId] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [selectedWeekKeys, setSelectedWeekKeys] = useState<string[]>([]);
  /** Staged roster actions keyed by empNo::workDate — saved together. */
  const [drafts, setDrafts] = useState<
    Record<string, ValidationRosterLabelCode>
  >({});

  const labelsByCode = useMemo(() => {
    const map = new Map<string, ScheduleLabelOption>();
    for (const label of scheduleLabels) {
      map.set(label.code, label);
    }
    return map;
  }, [scheduleLabels]);

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

  function saveDrafts() {
    if (!hasDrafts) return;

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

    startTransition(async () => {
      const result = await saveValidationRosterDays({
        changes: changes.map(({ staffId, workDate, labelCode }) => ({
          staffId,
          workDate,
          labelCode,
        })),
      });
      if (!("ok" in result) || !result.ok) return;

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
    });
  }

  function onDepartmentChange(next: string) {
    setDepartmentId(next);
    setEmpNo("");
    setSelectedWeekKeys([]);
    setDrafts({});
  }

  function onEmployeeChange(next: string) {
    setEmpNo(next);
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
            onChange={setSelectedWeekKeys}
          />
        </div>
        {canEditRoster ? (
          <div className="ml-auto flex shrink-0 flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-transparent">
              Save
            </span>
            <Button
              type="button"
              disabled={pending || !hasDrafts}
              onClick={saveDrafts}
              className="h-10 px-4"
            >
              {pending
                ? "Saving…"
                : hasDrafts
                  ? `Save ${draftCount} edit${draftCount === 1 ? "" : "s"}`
                  : "Save"}
            </Button>
          </div>
        ) : null}
      </div>

      {!ready ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
          <p className="text-sm text-black/55">
            Select a department, then an employee, then one or more weeks to
            load validation results. Stage actions on days, then Save.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/70">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/10 bg-black/[0.03] text-xs uppercase tracking-wide text-black/45">
              <tr>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Roster</th>
                <th className="px-3 py-2.5 font-medium">Schedule</th>
                <th className="px-3 py-2.5 font-medium">Clock in</th>
                <th className="px-3 py-2.5 font-medium">Clock out</th>
                <th className="px-3 py-2.5 font-medium">Hours</th>
                <th className="px-3 py-2.5 font-medium">Issue</th>
                <th className="px-3 py-2.5 font-medium">Actions</th>
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
                        {row.workDate}
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
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canEditRoster && staffId
                          ? ROSTER_ACTIONS.map((action) => {
                              const selected =
                                draft === action.code ||
                                (!draft &&
                                  row.rosterLabel === action.rosterCode);
                              const label = labelsByCode.get(action.rosterCode);
                              const tooltip =
                                action.code === "SH"
                                  ? `${label?.name ?? action.fallbackTitle} — counted for payroll, hours unchanged`
                                  : (label?.name ?? action.fallbackTitle);
                              return (
                                <button
                                  key={action.code}
                                  type="button"
                                  title={tooltip}
                                  aria-label={tooltip}
                                  disabled={pending}
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
                                                boxShadow: "0 0 0 1px #000000",
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
                                                boxShadow: "0 0 0 1px #000000",
                                              }
                                            : {}),
                                        }
                                  }
                                >
                                  {action.code}
                                </button>
                              );
                            })
                          : (
                            <span className="text-xs text-black/40">—</span>
                          )}
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
