import { isValidMonthKey } from "@/lib/hr/attendance-months";
import {
  readPersistedJson,
  scopedPersistenceKey,
  writePersistedJson,
} from "@/lib/ui/client-persistence";

export const HR_ATTENDANCE_RECORDS_FILTERS_KEY =
  "ss-ops-hr-attendance-records-filters";
export const HR_ATTENDANCE_INSIGHTS_FILTERS_KEY =
  "ss-ops-hr-attendance-insights-filters";
export const HR_ATTENDANCE_VALIDATION_FILTERS_KEY =
  "ss-ops-hr-attendance-validation-filters";
export const HR_SCHEDULES_WEEK_OFFSET_KEY = "ss-ops-hr-schedules-week-offset";
export const HR_ATTENDANCE_MONTHS_KEY = "ss-ops-hr-attendance-months";

export type HrAttendanceRecordsFilters = {
  empNo: string;
  departmentId: string;
  status: string;
  selectedWeekKeys: string[];
  dayStart: string;
  dayEnd: string;
};

export type HrAttendanceInsightsFilters = {
  selectedWeekKeys: string[];
  dayStart: string;
  dayEnd: string;
  selectedMonthKeys: string[];
};

export type HrAttendanceValidationFilters = {
  departmentId: string;
  empNo: string;
  selectedWeekKeys: string[];
};

export function hrFiltersStorageKey(
  base: string,
  venueKey: string | null | undefined,
): string {
  return scopedPersistenceKey(base, venueKey);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isValidIsoDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function sanitizeWeekKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && isValidIsoDateKey(item),
      ),
    ),
  ].sort();
}

function sanitizeMonthKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && isValidMonthKey(item),
      ),
    ),
  ]
    .sort()
    .slice(0, 6);
}

export function defaultHrAttendanceRecordsFilters(): HrAttendanceRecordsFilters {
  return {
    empNo: "",
    departmentId: "",
    status: "",
    selectedWeekKeys: [],
    dayStart: "",
    dayEnd: "",
  };
}

export function sanitizeHrAttendanceRecordsFilters(
  value: unknown,
): HrAttendanceRecordsFilters {
  const defaults = defaultHrAttendanceRecordsFilters();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Record<string, unknown>;
  const dayStart = asString(raw.dayStart);
  const dayEnd = asString(raw.dayEnd);
  return {
    empNo: asString(raw.empNo),
    departmentId: asString(raw.departmentId),
    status: asString(raw.status),
    selectedWeekKeys: sanitizeWeekKeys(raw.selectedWeekKeys),
    dayStart: dayStart && isValidIsoDateKey(dayStart) ? dayStart : "",
    dayEnd: dayEnd && isValidIsoDateKey(dayEnd) ? dayEnd : "",
  };
}

export function defaultHrAttendanceInsightsFilters(): HrAttendanceInsightsFilters {
  return {
    selectedWeekKeys: [],
    dayStart: "",
    dayEnd: "",
    selectedMonthKeys: [],
  };
}

export function sanitizeHrAttendanceInsightsFilters(
  value: unknown,
): HrAttendanceInsightsFilters {
  const defaults = defaultHrAttendanceInsightsFilters();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Record<string, unknown>;
  const dayStart = asString(raw.dayStart);
  const dayEnd = asString(raw.dayEnd);
  return {
    selectedWeekKeys: sanitizeWeekKeys(raw.selectedWeekKeys),
    dayStart: dayStart && isValidIsoDateKey(dayStart) ? dayStart : "",
    dayEnd: dayEnd && isValidIsoDateKey(dayEnd) ? dayEnd : "",
    selectedMonthKeys: sanitizeMonthKeys(raw.selectedMonthKeys),
  };
}

export function defaultHrAttendanceValidationFilters(): HrAttendanceValidationFilters {
  return {
    departmentId: "",
    empNo: "",
    selectedWeekKeys: [],
  };
}

export function sanitizeHrAttendanceValidationFilters(
  value: unknown,
): HrAttendanceValidationFilters {
  const defaults = defaultHrAttendanceValidationFilters();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Record<string, unknown>;
  return {
    departmentId: asString(raw.departmentId),
    empNo: asString(raw.empNo),
    selectedWeekKeys: sanitizeWeekKeys(raw.selectedWeekKeys),
  };
}

export function sanitizeWeekOffset(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return 0;
}

export function readHrWeekOffset(storageKey: string): number | null {
  const parsed = readPersistedJson(storageKey);
  if (parsed == null) return null;
  return sanitizeWeekOffset(parsed);
}

export function writeHrWeekOffset(storageKey: string, offset: number): void {
  writePersistedJson(storageKey, sanitizeWeekOffset(offset));
}

export function sanitizeAttendanceMonthKeys(value: unknown): string[] {
  return sanitizeMonthKeys(value);
}

export function readAttendanceMonthKeys(storageKey: string): string[] | null {
  const parsed = readPersistedJson(storageKey);
  if (parsed == null) return null;
  return sanitizeAttendanceMonthKeys(parsed);
}

export function writeAttendanceMonthKeys(
  storageKey: string,
  monthKeys: string[],
): void {
  writePersistedJson(storageKey, sanitizeAttendanceMonthKeys(monthKeys));
}

/** Server-safe parse of a cookie value for attendance month keys. */
export function parseAttendanceMonthKeysCookie(
  raw: string | undefined | null,
): string[] {
  if (!raw) return [];
  try {
    const decoded = decodeURIComponent(raw);
    return sanitizeAttendanceMonthKeys(JSON.parse(decoded));
  } catch {
    try {
      return sanitizeAttendanceMonthKeys(JSON.parse(raw));
    } catch {
      return [];
    }
  }
}
