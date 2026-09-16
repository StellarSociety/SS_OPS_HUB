"use server";

import { currentMonthKey, isValidMonthKey } from "@/lib/hr/attendance-months";
import {
  loadMobileStaffAttendanceMonth,
  type MobileAttendanceMonth,
} from "@/lib/mobile/employee-attendance";
import {
  loadMobileStaffDocsPage,
  type MobileDocsPage,
} from "@/lib/mobile/employee-docs";
import {
  loadMobileStaffLeavePage,
  type MobileLeavePage,
} from "@/lib/mobile/employee-leave";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import {
  loadMobileWelcomeProfileForStaff,
  type MobileWelcomeProfile,
} from "@/lib/mobile/welcome-profile";

export type MobilePreviewEmployeeBundle = {
  profile: MobileWelcomeProfile;
  attendance: MobileAttendanceMonth;
  leave: MobileLeavePage;
  docs: MobileDocsPage;
  userName: string | null;
};

export async function loadMobilePreviewEmployeeAction(input: {
  venueId: string;
  staffId: string;
  monthKey?: string | null;
}): Promise<MobilePreviewEmployeeBundle | null> {
  const monthKey =
    input.monthKey && isValidMonthKey(input.monthKey)
      ? input.monthKey
      : currentMonthKey();
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return null;

  const staffId = input.staffId.trim();
  if (!staffId) return null;

  const [profile, attendance, leave, docs] = await Promise.all([
    loadMobileWelcomeProfileForStaff(staffId, { venueId: access.venueId }),
    loadMobileStaffAttendanceMonth({
      staffId,
      venueId: access.venueId,
      monthKey,
    }),
    loadMobileStaffLeavePage({
      staffId,
      venueId: access.venueId,
    }),
    loadMobileStaffDocsPage({
      staffId,
      venueId: access.venueId,
    }),
  ]);

  return {
    profile,
    attendance,
    leave,
    docs,
    userName: profile.fullName,
  };
}

