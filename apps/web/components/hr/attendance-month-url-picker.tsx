"use client";

import { AttendanceMultiMonthPicker } from "@/components/hr/attendance-date-filters";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  hrFiltersStorageKey,
  HR_ATTENDANCE_MONTHS_KEY,
  writeAttendanceMonthKeys,
} from "@/lib/hr/hr-filters-storage";
import { monthKeysHref } from "@/lib/hr/attendance-months";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  selectedMonthKeys: string[];
};

/**
 * Optional month picker that refetches via URL (`?month=` / `?months=`)
 * and mirrors the selection into a venue-scoped cookie for refresh persistence.
 */
export function AttendanceMonthUrlPicker({ selectedMonthKeys }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { slug } = useVenueScope();
  const storageKey = hrFiltersStorageKey(HR_ATTENDANCE_MONTHS_KEY, slug);

  return (
    <AttendanceMultiMonthPicker
      selectedMonthKeys={selectedMonthKeys}
      onChange={(next) => {
        writeAttendanceMonthKeys(storageKey, next);
        router.push(monthKeysHref(pathname, next));
      }}
    />
  );
}
