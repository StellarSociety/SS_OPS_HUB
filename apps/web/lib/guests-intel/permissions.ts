import {
  canAccessModule,
  hasVenueScopedFeatureAccess,
  hasVenueScopedPermission,
} from "@/lib/module-access";
import type { UserPermission } from "@/lib/role-permissions";
import { GUESTS_INTEL_FEATURES, GUESTS_INTEL_MODULE_KEY } from "./types";

export function canAccessGuestsIntel(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return canAccessModule(permissions, GUESTS_INTEL_MODULE_KEY, venueId);
}

export function canAccessOverview(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.overview,
    venueId,
  );
}

export function canAccessCollect(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.collect,
    venueId,
  );
}

export function canEditCollect(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.collect,
    "edit",
    venueId,
  );
}

export function canAccessGuests(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.guests,
    venueId,
  );
}

export function canAccessRewards(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.rewards,
    venueId,
  );
}

export function canEditRewards(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.rewards,
    "edit",
    venueId,
  );
}

export function canAccessRedeem(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.redeem,
    venueId,
  );
}

export function canEditRedeem(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.redeem,
    "edit",
    venueId,
  );
}

export function canAccessSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.settings,
    venueId,
  );
}

export function canAdminSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    GUESTS_INTEL_MODULE_KEY,
    GUESTS_INTEL_FEATURES.settings,
    "admin",
    venueId,
  );
}

export function firstAccessibleGuestsIntelPath(
  permissions: UserPermission[],
  venueId: string,
): string | null {
  if (canAccessOverview(permissions, venueId)) return "/guests-intel";
  if (canAccessCollect(permissions, venueId)) return "/guests-intel/collect";
  if (canAccessGuests(permissions, venueId)) return "/guests-intel/guests";
  if (canAccessRewards(permissions, venueId)) return "/guests-intel/rewards";
  if (canAccessRedeem(permissions, venueId)) return "/guests-intel/redeem";
  if (canAccessSettings(permissions, venueId)) return "/guests-intel/settings";
  return null;
}
