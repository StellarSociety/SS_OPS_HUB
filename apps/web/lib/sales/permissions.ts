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

export function canAccessDailyVsWaiters(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return (
    canAccessVenueDaily(permissions, venueId) &&
    canAccessWaiterDaily(permissions, venueId)
  );
}

export function canEditDailyVsWaiters(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return (
    canEditVenueDaily(permissions, venueId) &&
    canEditWaiterDaily(permissions, venueId)
  );
}

export function canAccessSalesModule(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return (
    canAccessVenueDaily(permissions, venueId) ||
    canAccessWaiterDaily(permissions, venueId) ||
    canAccessDailyVsWaiters(permissions, venueId) ||
    canAccessCashDrawer(permissions, venueId) ||
    canAccessCashUp(permissions, venueId)
  );
}
