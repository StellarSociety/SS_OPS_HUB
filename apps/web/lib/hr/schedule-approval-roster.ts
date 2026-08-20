import {
  formatWeekRangeLabel,
  getWeekDayColumns,
  resolveScheduleDepartment,
  scheduleCellKey,
  type ScheduleDepartmentKey,
} from "@/lib/hr/schedules";
import {
  listScheduleDaysByDateRange,
  listStaffForVenue,
} from "@/lib/hr/store";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RosterSnapshotCell = {
  name: string;
  empNo: string;
  label: string;
  shift: string | null;
};

export type RosterSnapshot = {
  cells: Record<string, RosterSnapshotCell>;
};

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MAX_ALTERATION_LINES = 12;

export function mondayFromWeekStart(weekStart: string): Date {
  const [year, month, day] = weekStart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatScheduleWeekLabel(weekStart: string): string {
  return formatWeekRangeLabel(mondayFromWeekStart(weekStart));
}

function formatCellDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS_SHORT[date.getDay()]} ${day} ${MONTHS_SHORT[month - 1]}`;
}

function cellToken(label: string): string {
  return label.trim() || "(empty)";
}

function staffLabel(cell: RosterSnapshotCell | undefined, staffId: string): string {
  if (!cell) return staffId;
  const name = cell.name.trim() || "Employee";
  const empNo = cell.empNo.trim();
  return empNo ? `${name} (${empNo})` : name;
}

export async function snapshotDepartmentRoster(
  supabase: SupabaseClient,
  venueId: string,
  weekStart: string,
  departmentKey: ScheduleDepartmentKey,
): Promise<RosterSnapshot> {
  const monday = mondayFromWeekStart(weekStart);
  const days = getWeekDayColumns(monday);
  const fromDate = days[0]?.key;
  const toDate = days[days.length - 1]?.key;
  if (!fromDate || !toDate) return { cells: {} };

  const staff = await listStaffForVenue(supabase, venueId);
  const deptStaff = staff.filter(
    (member) =>
      Boolean(member.joining_date?.trim()) &&
      resolveScheduleDepartment(member.department?.name) === departmentKey,
  );
  if (deptStaff.length === 0) return { cells: {} };

  const rows = await listScheduleDaysByDateRange(supabase, venueId, {
    fromDate,
    toDate,
    staffIds: deptStaff.map((member) => member.id),
  });

  const staffById = new Map(
    deptStaff.map((member) => [
      member.id,
      {
        name: member.full_name,
        empNo: member.emp_no ?? "",
      },
    ]),
  );

  const cells: Record<string, RosterSnapshotCell> = {};
  for (const row of rows) {
    const meta = staffById.get(row.staff_id);
    if (!meta) continue;
    const label = row.label_code === "LP" ? "AL" : row.label_code;
    if (!label) continue;
    cells[scheduleCellKey(row.staff_id, row.work_date)] = {
      name: meta.name,
      empNo: meta.empNo,
      label,
      shift: row.shift_template_id,
    };
  }

  return { cells };
}

export function parseRosterSnapshot(value: unknown): RosterSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const cells = (value as { cells?: unknown }).cells;
  if (!cells || typeof cells !== "object") return null;
  return { cells: cells as Record<string, RosterSnapshotCell> };
}

export function describeRosterAlterations(
  submitted: RosterSnapshot,
  current: RosterSnapshot,
): string[] {
  const keys = new Set([
    ...Object.keys(submitted.cells),
    ...Object.keys(current.cells),
  ]);
  const lines: string[] = [];

  for (const key of [...keys].sort()) {
    const before = submitted.cells[key];
    const after = current.cells[key];
    const beforeLabel = before?.label?.trim() ?? "";
    const afterLabel = after?.label?.trim() ?? "";
    const beforeShift = before?.shift ?? null;
    const afterShift = after?.shift ?? null;
    if (beforeLabel === afterLabel && beforeShift === afterShift) continue;

    const datePart = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    const who = staffLabel(after ?? before, key.split(":")[0] ?? "");
    if (beforeLabel === afterLabel) {
      lines.push(
        `${who} · ${formatCellDate(datePart)}: ${cellToken(afterLabel)} (shift times changed)`,
      );
      continue;
    }
    lines.push(
      `${who} · ${formatCellDate(datePart)}: ${cellToken(beforeLabel)} → ${cellToken(afterLabel)}`,
    );
  }

  return lines;
}

export function formatAlterationsBody(lines: string[]): string {
  if (lines.length === 0) return "";
  const shown = lines.slice(0, MAX_ALTERATION_LINES);
  const extra = lines.length - shown.length;
  const block = shown.map((line) => `• ${line}`).join("\n");
  if (extra <= 0) return block;
  return `${block}\n• and ${extra} more`;
}
