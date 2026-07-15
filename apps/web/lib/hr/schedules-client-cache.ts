import type {
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
