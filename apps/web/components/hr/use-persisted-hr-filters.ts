"use client";

import { useEffect, useState } from "react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  defaultHrAttendanceInsightsFilters,
  defaultHrAttendanceRecordsFilters,
  defaultHrAttendanceValidationFilters,
  hrFiltersStorageKey,
  HR_ATTENDANCE_INSIGHTS_FILTERS_KEY,
  HR_ATTENDANCE_RECORDS_FILTERS_KEY,
  HR_ATTENDANCE_VALIDATION_FILTERS_KEY,
  HR_SCHEDULES_WEEK_OFFSET_KEY,
  readHrWeekOffset,
  sanitizeHrAttendanceInsightsFilters,
  sanitizeHrAttendanceRecordsFilters,
  sanitizeHrAttendanceValidationFilters,
  writeHrWeekOffset,
  type HrAttendanceInsightsFilters,
  type HrAttendanceRecordsFilters,
  type HrAttendanceValidationFilters,
} from "@/lib/hr/hr-filters-storage";
import { usePersistedState } from "@/lib/ui/use-persisted-state";

function useVenueStorageKey(base: string): string {
  const { slug } = useVenueScope();
  return hrFiltersStorageKey(base, slug);
}

export function usePersistedHrAttendanceRecordsFilters() {
  const storageKey = useVenueStorageKey(HR_ATTENDANCE_RECORDS_FILTERS_KEY);
  const [filters, setFilters] = usePersistedState(
    storageKey,
    defaultHrAttendanceRecordsFilters,
    sanitizeHrAttendanceRecordsFilters,
  );

  return {
    empNo: filters.empNo,
    departmentId: filters.departmentId,
    status: filters.status,
    selectedWeekKeys: filters.selectedWeekKeys,
    dayStart: filters.dayStart,
    dayEnd: filters.dayEnd,
    setEmpNo: (value: string) =>
      setFilters((prev) => ({ ...prev, empNo: value })),
    setDepartmentId: (value: string) =>
      setFilters((prev) => ({ ...prev, departmentId: value })),
    setStatus: (value: string) =>
      setFilters((prev) => ({ ...prev, status: value })),
    setSelectedWeekKeys: (
      value: string[] | ((prev: string[]) => string[]),
    ) =>
      setFilters((prev) => ({
        ...prev,
        selectedWeekKeys:
          typeof value === "function"
            ? value(prev.selectedWeekKeys)
            : value,
      })),
    setDayStart: (value: string) =>
      setFilters((prev) => ({ ...prev, dayStart: value })),
    setDayEnd: (value: string) =>
      setFilters((prev) => ({ ...prev, dayEnd: value })),
    setDayRange: (start: string, end: string) =>
      setFilters((prev) => ({ ...prev, dayStart: start, dayEnd: end })),
    patchFilters: (patch: Partial<HrAttendanceRecordsFilters>) =>
      setFilters((prev) => ({ ...prev, ...patch })),
  };
}

export function usePersistedHrAttendanceInsightsFilters(
  defaultMonthKeys?: string[],
) {
  const storageKey = useVenueStorageKey(HR_ATTENDANCE_INSIGHTS_FILTERS_KEY);
  const [filters, setFilters] = usePersistedState(
    storageKey,
    () => ({
      ...defaultHrAttendanceInsightsFilters(),
      selectedMonthKeys: defaultMonthKeys?.length ? defaultMonthKeys : [],
    }),
    sanitizeHrAttendanceInsightsFilters,
  );

  return {
    selectedWeekKeys: filters.selectedWeekKeys,
    dayStart: filters.dayStart,
    dayEnd: filters.dayEnd,
    selectedMonthKeys: filters.selectedMonthKeys,
    setSelectedWeekKeys: (
      value: string[] | ((prev: string[]) => string[]),
    ) =>
      setFilters((prev) => ({
        ...prev,
        selectedWeekKeys:
          typeof value === "function"
            ? value(prev.selectedWeekKeys)
            : value,
      })),
    setDayStart: (value: string) =>
      setFilters((prev) => ({ ...prev, dayStart: value })),
    setDayEnd: (value: string) =>
      setFilters((prev) => ({ ...prev, dayEnd: value })),
    setDayRange: (start: string, end: string) =>
      setFilters((prev) => ({ ...prev, dayStart: start, dayEnd: end })),
    setSelectedMonthKeys: (
      value: string[] | ((prev: string[]) => string[]),
    ) =>
      setFilters((prev) => ({
        ...prev,
        selectedMonthKeys:
          typeof value === "function"
            ? value(prev.selectedMonthKeys)
            : value,
      })),
    patchFilters: (patch: Partial<HrAttendanceInsightsFilters>) =>
      setFilters((prev) => ({ ...prev, ...patch })),
  };
}

export function usePersistedHrAttendanceValidationFilters() {
  const storageKey = useVenueStorageKey(HR_ATTENDANCE_VALIDATION_FILTERS_KEY);
  const [filters, setFilters, hydrated] = usePersistedState(
    storageKey,
    defaultHrAttendanceValidationFilters,
    sanitizeHrAttendanceValidationFilters,
  );

  return {
    departmentId: filters.departmentId,
    empNo: filters.empNo,
    selectedWeekKeys: filters.selectedWeekKeys,
    hydrated,
    setDepartmentId: (value: string) =>
      setFilters((prev) => ({
        ...prev,
        departmentId: value,
        // Clear employee when department changes to avoid stale selection.
        empNo: value === prev.departmentId ? prev.empNo : "",
      })),
    setEmpNo: (value: string) =>
      setFilters((prev) => ({ ...prev, empNo: value })),
    setSelectedWeekKeys: (
      value: string[] | ((prev: string[]) => string[]),
    ) =>
      setFilters((prev) => ({
        ...prev,
        selectedWeekKeys:
          typeof value === "function"
            ? value(prev.selectedWeekKeys)
            : value,
      })),
    patchFilters: (patch: Partial<HrAttendanceValidationFilters>) =>
      setFilters((prev) => ({ ...prev, ...patch })),
  };
}

export function usePersistedHrSchedulesWeekOffset(fallback = 0) {
  const storageKey = useVenueStorageKey(HR_SCHEDULES_WEEK_OFFSET_KEY);
  const [weekOffset, setWeekOffsetState] = useState(fallback);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = hydratedKey === storageKey;

  useEffect(() => {
    const stored = readHrWeekOffset(storageKey);
    setWeekOffsetState(stored ?? fallback);
    setHydratedKey(storageKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rehydrate on venue/key change
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeHrWeekOffset(storageKey, weekOffset);
  }, [hydrated, storageKey, weekOffset]);

  function setWeekOffset(value: number | ((prev: number) => number)) {
    setWeekOffsetState((prev) =>
      typeof value === "function" ? value(prev) : value,
    );
  }

  return { weekOffset, setWeekOffset };
}
