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
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import type { AccessMatrixLevel } from "@/lib/access/matrix";
import { canAccessHiring, canEditHiring } from "@/lib/hr/permissions";
import { sentimentEditFlags } from "@/lib/sentiment/workspace";
import {
  buildSelectVenuePageData,
  type SelectVenuePageData,
} from "@/lib/venue/select-venue-page-data";
import { canWriteConnectOnPhone } from "@/lib/connect/access";
import { canEditOwnLeave } from "@/lib/mobile/employee-hub-permissions";
import { hubUserForStaff } from "@/lib/mobile/hub-user-for-staff";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import { loadMobileWelcomeModulesForUser } from "@/lib/modules-hub-data";
import {
  countNotifications,
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/lib/notifications/store";
import type { NotificationRow } from "@/lib/notifications/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { Venue } from "@/lib/types/database";
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
  /** The welcome-screen apps exactly as this employee's phone shows them. */
  welcome: MobilePreviewWelcomeAccess;
};

export type MobilePreviewWelcomeAccess = {
  /** No Hub login linked to the staff record, so they can't sign in at all. */
  hasHubLogin: boolean;
  /** False when their phone shows the "No access" screen instead. */
  mobileAccess: boolean;
  modules: ModuleGridItem[];
  employeeHubLevel: AccessMatrixLevel;
  hubPages: string[];
  showHiring: boolean;
  /** This employee's own inbox — never the signed-in admin's. */
  notifications: NotificationRow[];
  notificationCount: number;
  unreadCount: number;
  /** Their venue picker: name, photo, emp no. and phone venues. */
  selectVenue: SelectVenuePageData | null;
  /** Edit rights on the phone (from their Mobile App Access switches). */
  canEditHiring: boolean;
  canApplyLeave: boolean;
  canWriteConnect: boolean;
  sentimentCanEdit: boolean;
  sentimentCanEditActions: boolean;
  userId: string | null;
};

const NO_LOGIN_WELCOME: MobilePreviewWelcomeAccess = {
  hasHubLogin: false,
  mobileAccess: false,
  modules: [],
  employeeHubLevel: "hidden",
  hubPages: [],
  showHiring: false,
  notifications: [],
  notificationCount: 0,
  unreadCount: 0,
  selectVenue: null,
  canEditHiring: false,
  canApplyLeave: false,
  canWriteConnect: false,
  sentimentCanEdit: false,
  sentimentCanEditActions: false,
  userId: null,
};

async function loadPreviewWelcomeAccess(
  staffId: string,
  venueId: string,
): Promise<MobilePreviewWelcomeAccess> {
  const service = createServiceClient();
  const userId = await hubUserForStaff(service, staffId);
  if (!userId) return NO_LOGIN_WELCOME;
  const { data: venue } = await service
    .from("venues")
    .select("*")
    .eq("id", venueId)
    .maybeSingle();
  if (!venue) return NO_LOGIN_WELCOME;
  const scope = { venueId, isGlobalVenue: Boolean((venue as Venue).is_global) };
  const [
    { modules, employeeHubLevel, permissions, canUseApp, hubPages },
    notifications,
    notificationCount,
    unreadCount,
    selectVenue,
  ] = await Promise.all([
    loadMobileWelcomeModulesForUser(service, userId, venue as Venue),
    listNotificationsForUser(service, userId, { ...scope, folder: "inbox", limit: 50 }),
    countNotifications(service, userId, { ...scope, folder: "inbox" }),
    countUnreadNotifications(service, userId, scope),
    buildSelectVenuePageData(service, {
      id: userId,
      email: null,
      requireMobileAppAccess: true,
    }),
  ]);
  const sentimentFlags = sentimentEditFlags(permissions, venueId);
  return {
    notifications,
    notificationCount,
    unreadCount,
    hasHubLogin: true,
    mobileAccess: canUseApp,
    modules,
    employeeHubLevel,
    hubPages,
    showHiring: canAccessHiring(permissions, venueId),
    selectVenue,
    canEditHiring: canEditHiring(permissions, venueId),
    canApplyLeave: canEditOwnLeave(permissions, venueId),
    canWriteConnect: canWriteConnectOnPhone(permissions, venueId),
    sentimentCanEdit: sentimentFlags.canEdit,
    sentimentCanEditActions: sentimentFlags.canEditActions,
    userId,
  };
}

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

  const [profile, attendance, leave, docs, welcome] = await Promise.all([
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
    loadPreviewWelcomeAccess(staffId, access.venueId),
  ]);

  return {
    profile,
    attendance,
    leave,
    docs,
    userName: profile.fullName,
    welcome,
  };
}

