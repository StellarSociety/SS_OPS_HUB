import {
  hasFeatureAccess,
  hasPermission,
  isAppAdmin,
  type AccessLevel,
  type UserPermission,
} from "@/lib/role-permissions";
import { SALES_FEATURES, SALES_MODULE_KEY } from "./types";

function matchesVenueScope(
  permissionVenueId: string | null,
  venueId: string,
): boolean {
  return permissionVenueId === null || permissionVenueId === venueId;
}

function hasSalesFeatureAccess(
  permissions: UserPermission[],
  featureKey: string,
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === SALES_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasFeatureAccess([p], SALES_MODULE_KEY, featureKey),
  );
}

function hasSalesPermission(
  permissions: UserPermission[],
  featureKey: string,
  minLevel: AccessLevel,
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === SALES_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasPermission([p], SALES_MODULE_KEY, featureKey, minLevel),
  );
}

export function canAccessOverview(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesFeatureAccess(permissions, SALES_FEATURES.overview, venueId);
}

export function canAccessVenueDaily(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesFeatureAccess(
    permissions,
    SALES_FEATURES.venueDaily,
    venueId,
  );
}

export function canEditVenueDaily(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesPermission(
    permissions,
    SALES_FEATURES.venueDaily,
    "edit",
    venueId,
  );
}

export function canAccessWaiterDaily(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesFeatureAccess(
    permissions,
    SALES_FEATURES.waiterDaily,
    venueId,
  );
}

export function canEditWaiterDaily(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesPermission(
    permissions,
    SALES_FEATURES.waiterDaily,
    "edit",
    venueId,
  );
}

export function canManageSalesWaiters(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return (
    canEditVenueDaily(permissions, venueId) ||
    canEditWaiterDaily(permissions, venueId)
  );
}

export function canAccessSalesWaitersSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return (
    canAccessVenueDaily(permissions, venueId) ||
    canAccessWaiterDaily(permissions, venueId)
  );
}

export function canAccessDiscounts(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return canAccessCashDrawer(permissions, venueId);
}

export function canEditDiscounts(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesPermission(
    permissions,
    SALES_FEATURES.cashDrawer,
    "edit",
    venueId,
  );
}

export function canAccessCashDrawer(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesFeatureAccess(
    permissions,
    SALES_FEATURES.cashDrawer,
    venueId,
  );
}

export function canAccessCashUp(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesFeatureAccess(permissions, SALES_FEATURES.cashUp, venueId);
}

export function canEditCashUp(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesPermission(
    permissions,
    SALES_FEATURES.cashUp,
    "edit",
    venueId,
  );
}

export function canAccessDailyVsWaiters(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesFeatureAccess(
    permissions,
    SALES_FEATURES.dailyVsWaiters,
    venueId,
  );
}

export function canEditDailyVsWaiters(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesPermission(
    permissions,
    SALES_FEATURES.dailyVsWaiters,
    "edit",
    venueId,
  );
}

export function canAccessForecast(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesFeatureAccess(permissions, SALES_FEATURES.forecast, venueId);
}

export function canEditForecast(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesPermission(
    permissions,
    SALES_FEATURES.forecast,
    "edit",
    venueId,
  );
}

/**
 * Sales settings are an admin-only surface. Only an App Admin, or a user whose
 * per-app role granted the sales `settings` feature (admin-tier), may enter.
 * Editors and viewers — even with page-level grants — are denied.
 */
export function canAccessSalesSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSalesPermission(
    permissions,
    SALES_FEATURES.settings,
    "admin",
    venueId,
  );
}

export function canAccessSalesModule(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return (
    canAccessOverview(permissions, venueId) ||
    canAccessVenueDaily(permissions, venueId) ||
    canAccessWaiterDaily(permissions, venueId) ||
    canAccessDailyVsWaiters(permissions, venueId) ||
    canAccessCashDrawer(permissions, venueId) ||
    canAccessForecast(permissions, venueId) ||
    canAccessCashUp(permissions, venueId)
  );
}

/**
 * First sales page (relative path) the user is allowed to open, in sidebar
 * order. Used to redirect users who land on a sub-page they cannot access to
 * somewhere they can, instead of showing a dead-end.
 */
export function firstAccessibleSalesPath(
  permissions: UserPermission[],
  venueId: string,
): string | null {
  if (canAccessOverview(permissions, venueId)) return "/sales";
  if (canAccessVenueDaily(permissions, venueId)) return "/sales/daily";
  if (canAccessWaiterDaily(permissions, venueId)) return "/sales/waiter";
  if (canAccessDailyVsWaiters(permissions, venueId))
    return "/sales/daily-vs-waiters/figures-verification";
  if (canAccessCashDrawer(permissions, venueId)) return "/sales/discounts";
  if (canAccessForecast(permissions, venueId)) return "/sales/forecast";
  if (canAccessCashUp(permissions, venueId)) return "/sales/daily-snap";
  return null;
}
