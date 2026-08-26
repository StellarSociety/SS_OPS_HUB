import {
  canAccessAttendance,
  canAccessAttendanceValidation,
  canAccessBenefits,
  canAccessHrOverview,
  canAccessLeave,
  canAccessPayroll,
  canAccessSchedules,
  canAccessStaff,
  canAccessStaffCompliance,
  canAdminLookups,
  canViewPayslips,
  canViewStaff,
  hasHrFeatureAccess,
} from "@/lib/hr/permissions";
import {
  canAccessAccountingSettings,
  canAccessAp,
} from "@/lib/accounting/permissions";
import { canAccessModule } from "@/lib/module-access";
import { isAppAdmin, type UserPermission } from "@/lib/role-permissions";
import {
  canAccessCashUp,
  canAccessCash,
  canAccessDailyVsWaiters,
  canAccessDiscounts,
  canAccessForecast,
  canAccessOverview as canAccessSalesOverview,
  canAccessReports,
  canAccessSalesSettings,
  canAccessVenueDaily,
  canAccessVouchers,
  canAccessWaiterDaily,
} from "@/lib/sales/permissions";
import {
  canAccessOverview as canAccessSentimentOverview,
  canAccessReviews as canAccessSentimentReviews,
  canAccessActions as canAccessSentimentActions,
  canAccessSettings as canAccessSentimentSettings,
} from "@/lib/sentiment/permissions";
import {
  canAccessOverview as canAccessSaveLogOverview,
  canAccessLogs as canAccessSaveLogLogs,
  canAccessSettings as canAccessSaveLogSettings,
} from "@/lib/save-log/permissions";
import {
  canAccessMobileApp,
  canAccessSettings as canAccessMobileSettings,
} from "@/lib/mobile/permissions";
import { toRelativePathname, type VenueScope } from "@/lib/venue/scope-routing";

function startsWithPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isStaffDirectoryPath(pathname: string): boolean {
  if (startsWithPath(pathname, "/hr/staff")) return true;
  return /^\/hr\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    pathname,
  );
}

export function toCanonicalAppPath(
  href: string,
  scope: VenueScope,
  slug: string | null,
): string {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  return toRelativePathname(path, scope, slug);
}

/**
 * Whether this user may open a canonical app path (e.g. `/hr/staff/entry`)
 * at the active venue. Unknown non-app paths are allowed.
 */
export function canOpenAppPath(
  permissions: UserPermission[],
  venueId: string,
  pathname: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  if (startsWithPath(pathname, "/hr")) {
    if (pathname === "/hr") return canAccessHrOverview(permissions, venueId);
    if (startsWithPath(pathname, "/hr/settings")) {
      return canAdminLookups(permissions, venueId);
    }
    if (isStaffDirectoryPath(pathname)) {
      return canAccessStaff(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/assets")) {
      return canAccessStaffCompliance(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/schedules")) {
      return canAccessSchedules(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/attendance/leave")) {
      return canAccessLeave(permissions, venueId);
    }
    if (
      startsWithPath(pathname, "/hr/attendance/validation") ||
      startsWithPath(pathname, "/hr/attendance/approvals-check")
    ) {
      return canAccessAttendanceValidation(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/attendance")) {
      return canAccessAttendance(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/benefits")) {
      return canAccessBenefits(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/payroll")) {
      return canAccessPayroll(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/payslips")) {
      return canViewPayslips(permissions, venueId);
    }
    if (startsWithPath(pathname, "/hr/expenses")) {
      return (
        hasHrFeatureAccess(permissions, "expenses", venueId) ||
        canAccessPayroll(permissions, venueId)
      );
    }
    if (startsWithPath(pathname, "/hr/communications")) {
      return (
        hasHrFeatureAccess(permissions, "communications", venueId) ||
        canViewStaff(permissions, venueId)
      );
    }
    if (startsWithPath(pathname, "/hr/onboarding")) {
      return (
        hasHrFeatureAccess(permissions, "onboarding", venueId) ||
        canAccessStaff(permissions, venueId)
      );
    }
    if (startsWithPath(pathname, "/hr/offboarding")) {
      return (
        hasHrFeatureAccess(permissions, "offboarding", venueId) ||
        canViewStaff(permissions, venueId)
      );
    }
    return canAccessModule(permissions, "hr", venueId);
  }

  if (startsWithPath(pathname, "/sales")) {
    if (pathname === "/sales") {
      return canAccessSalesOverview(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/settings")) {
      return canAccessSalesSettings(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/daily-vs-waiters")) {
      return canAccessDailyVsWaiters(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/daily-snap")) {
      return canAccessCashUp(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/daily")) {
      return canAccessVenueDaily(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/waiter")) {
      return canAccessWaiterDaily(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/discounts")) {
      return canAccessDiscounts(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/cash")) {
      return canAccessCash(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/reports")) {
      return canAccessReports(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/forecast")) {
      return canAccessForecast(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sales/vouchers")) {
      return canAccessVouchers(permissions, venueId);
    }
    return canAccessModule(permissions, "sales", venueId);
  }

  if (startsWithPath(pathname, "/accounting")) {
    if (startsWithPath(pathname, "/accounting/settings")) {
      return canAccessAccountingSettings(permissions, venueId);
    }
    if (startsWithPath(pathname, "/accounting/invoices")) {
      return canAccessAp(permissions, venueId);
    }
    return canAccessModule(permissions, "accounting", venueId);
  }

  if (startsWithPath(pathname, "/sentiment")) {
    if (pathname === "/sentiment") {
      return canAccessSentimentOverview(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sentiment/settings")) {
      return canAccessSentimentSettings(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sentiment/reviews")) {
      return canAccessSentimentReviews(permissions, venueId);
    }
    if (startsWithPath(pathname, "/sentiment/justify")) {
      return true;
    }
    if (startsWithPath(pathname, "/sentiment/actions")) {
      return canAccessSentimentActions(permissions, venueId);
    }
    return canAccessModule(permissions, "sentiment", venueId);
  }

  if (startsWithPath(pathname, "/save-log")) {
    if (pathname === "/save-log") {
      return canAccessSaveLogOverview(permissions, venueId);
    }
    if (startsWithPath(pathname, "/save-log/settings")) {
      return canAccessSaveLogSettings(permissions, venueId);
    }
    if (startsWithPath(pathname, "/save-log/logs")) {
      return canAccessSaveLogLogs(permissions, venueId);
    }
    return canAccessModule(permissions, "save_log", venueId);
  }

  if (startsWithPath(pathname, "/mobile")) {
    if (startsWithPath(pathname, "/mobile/settings")) {
      return canAccessMobileSettings(permissions, venueId);
    }
    return canAccessMobileApp(permissions, venueId);
  }

  if (startsWithPath(pathname, "/m")) {
    return canAccessMobileApp(permissions, venueId);
  }

  return true;
}
