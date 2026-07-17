"use client";

import { AttendanceMultiMonthPicker } from "@/components/hr/attendance-date-filters";
import { monthKeysHref } from "@/lib/hr/attendance-months";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  selectedMonthKeys: string[];
};

/**
 * Optional month picker that refetches via URL (`?month=` / `?months=`).
 * Clear removes the query so table filters (weeks/days/etc.) work on the
 * default loaded slice.
 */
export function AttendanceMonthUrlPicker({ selectedMonthKeys }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <AttendanceMultiMonthPicker
      selectedMonthKeys={selectedMonthKeys}
      onChange={(next) => {
        router.push(monthKeysHref(pathname, next));
      }}
    />
  );
}
