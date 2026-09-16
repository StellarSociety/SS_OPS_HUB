"use server";

import { currentMonthKey, isValidMonthKey } from "@/lib/hr/attendance-months";
import {
  emptyAttendanceMonth,
  loadMobileEmployeeAttendanceMonth,
  loadMobileStaffAttendanceMonth,
  type MobileAttendanceMonth,
} from "@/lib/mobile/employee-attendance";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";

export async function loadMobileAttendanceMonthAction(input: {
  venueId: string;
  monthKey: string;
  staffId?: string | null;
}): Promise<MobileAttendanceMonth> {
  const monthKey = isValidMonthKey(input.monthKey)
    ? input.monthKey
    : currentMonthKey();
  const fallback = emptyAttendanceMonth(monthKey);
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return fallback;

  const staffId = input.staffId?.trim() || "";
  if (staffId) {
    return loadMobileStaffAttendanceMonth({
      staffId,
      venueId: access.venueId,
      monthKey,
    });
  }

  return loadMobileEmployeeAttendanceMonth({
    userId: access.userId,
    venueId: access.venueId,
    monthKey,
  });
}
