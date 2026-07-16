import type {
  ScheduleAttendanceCell,
  ScheduleCellValue,
  ScheduleWeekSection,
} from "@/lib/hr/schedules";

/** Session-lifetime cache so tab / view / week switches feel instant. */

type WeekDaysEntry = {
  cells: Record<string, ScheduleCellValue>;
  loadedStaffIds: Set<string>;
};

const weekDaysCache = new Map<string, WeekDaysEntry>();
const sectionsCache = new Map<string, ScheduleWeekSection[]>();

export function scheduleWeekDaysCacheKey(fromDate: string, toDate: string) {
  return `days:${fromDate}:${toDate}`;
}

export function scheduleSectionsCacheKey(
  departmentKey: string,
  weekStart: string,
) {
  return `sections:${departmentKey}:${weekStart}`;
}

export function getCachedScheduleDaysForStaff(
  weekKey: string,
  staffIds: string[],
): Record<string, ScheduleCellValue> | null {
  const entry = weekDaysCache.get(weekKey);
  if (!entry) return null;
  if (staffIds.length === 0) return {};
  const missing = staffIds.some((id) => !entry.loadedStaffIds.has(id));
  if (missing) return null;
  return entry.cells;
}

export function mergeCachedScheduleDays(
  weekKey: string,
  staffIds: string[],
  cells: Record<string, ScheduleCellValue>,
) {
  const entry = weekDaysCache.get(weekKey) ?? {
    cells: {},
    loadedStaffIds: new Set<string>(),
  };
  entry.cells = { ...entry.cells, ...cells };
  for (const id of staffIds) entry.loadedStaffIds.add(id);
  weekDaysCache.set(weekKey, entry);
}

export function patchCachedScheduleDays(
  weekKey: string,
  patch: Record<string, ScheduleCellValue | null>,
) {
  const entry = weekDaysCache.get(weekKey);
  if (!entry) return;
  const next = { ...entry.cells };
  for (const [cellKey, value] of Object.entries(patch)) {
    if (value == null) delete next[cellKey];
    else next[cellKey] = value;
  }
  entry.cells = next;
  weekDaysCache.set(weekKey, entry);
}

export function getCachedScheduleSections(key: string) {
  return sectionsCache.get(key) ?? null;
}

export function setCachedScheduleSections(
  key: string,
  sections: ScheduleWeekSection[],
) {
  sectionsCache.set(key, sections);
}

/** Drop cached section boards for weeks after `weekStart` so they re-fetch the propagated layout. */
export function clearCachedScheduleSectionsAfter(
  departmentKey: string,
  weekStart: string,
) {
  const prefix = `sections:${departmentKey}:`;
  for (const key of [...sectionsCache.keys()]) {
    if (!key.startsWith(prefix)) continue;
    const cachedWeek = key.slice(prefix.length);
    if (cachedWeek > weekStart) sectionsCache.delete(key);
  }
}

/** Drop all cached roster day cells (e.g. after validation marks a leave/absence). */
export function clearAllCachedScheduleDays() {
  weekDaysCache.clear();
}

type WeekAttendanceEntry = {
  map: Record<string, ScheduleAttendanceCell>;
  hint: string | null;
};

const weekAttendanceCache = new Map<string, WeekAttendanceEntry>();

export function scheduleWeekAttendanceCacheKey(
  fromDate: string,
  toDate: string,
  staffKey: string,
) {
  return `attendance:${fromDate}:${toDate}:${staffKey}`;
}

export function getCachedScheduleAttendance(key: string) {
  return weekAttendanceCache.get(key) ?? null;
}

export function setCachedScheduleAttendance(
  key: string,
  entry: WeekAttendanceEntry,
) {
  weekAttendanceCache.set(key, entry);
}

export function clearCachedScheduleAttendance() {
  weekAttendanceCache.clear();
}
