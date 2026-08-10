import {
  hasFeatureAccess,
  hasPermission,
  isAppAdmin,
  type AccessLevel,
  type UserPermission,
} from "@/lib/role-permissions";
import { ACCOUNTING_FEATURES, ACCOUNTING_MODULE_KEY } from "./types";

function matchesVenueScope(
  permissionVenueId: string | null,
  venueId?: string | null,
): boolean {
  if (!venueId) return true;
  return permissionVenueId === null || permissionVenueId === venueId;
}

export function hasAccountingPermission(
  permissions: UserPermission[],
  featureKey: string,
  minLevel: AccessLevel = "view",
  venueId?: string | null,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === ACCOUNTING_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasPermission([p], ACCOUNTING_MODULE_KEY, featureKey, minLevel),
  );
}

export function hasAccountingFeatureAccess(
  permissions: UserPermission[],
  featureKey: string,
  venueId?: string | null,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === ACCOUNTING_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasFeatureAccess([p], ACCOUNTING_MODULE_KEY, featureKey),
  );
}

export function canAccessAccountingSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasAccountingFeatureAccess(
    permissions,
    ACCOUNTING_FEATURES.settings,
    venueId,
  );
}

export function canAdminAccountingSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasAccountingPermission(
    permissions,
    ACCOUNTING_FEATURES.settings,
    "admin",
    venueId,
  );
}

export function canAccessAp(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasAccountingFeatureAccess(
    permissions,
    ACCOUNTING_FEATURES.ap,
    venueId,
  );
}

export function canEditAp(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;
  return (
    hasAccountingPermission(permissions, ACCOUNTING_FEATURES.ap, "edit", venueId) ||
    hasAccountingPermission(permissions, ACCOUNTING_FEATURES.ap, "admin", venueId) ||
    permissions.some(
      (p) =>
        p.module_key === ACCOUNTING_MODULE_KEY &&
        p.feature_key === ACCOUNTING_FEATURES.ap &&
        matchesVenueScope(p.venue_id, venueId) &&
        p.access_level === "submit",
    )
  );
}

export function canAdminAp(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasAccountingPermission(
    permissions,
    ACCOUNTING_FEATURES.ap,
    "admin",
    venueId,
  );
}

export function getApAccessLevel(
  permissions: UserPermission[],
  venueId: string,
): AccessLevel | null {
  if (isAppAdmin(permissions)) return "admin";
  const levels: AccessLevel[] = ["admin", "edit", "view", "submit"];
  for (const level of levels) {
    if (level === "submit") {
      const has = permissions.some(
        (p) =>
          p.module_key === ACCOUNTING_MODULE_KEY &&
          p.feature_key === ACCOUNTING_FEATURES.ap &&
          matchesVenueScope(p.venue_id, venueId) &&
          p.access_level === "submit",
      );
      if (has) return "submit";
      continue;
    }
    if (hasAccountingPermission(permissions, ACCOUNTING_FEATURES.ap, level, venueId)) {
      return level;
    }
  }
  return null;
}
