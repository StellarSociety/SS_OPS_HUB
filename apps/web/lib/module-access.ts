import { getFeaturesForModule } from "@/lib/modules-catalog";
import {
  hasPermission,
  isAppAdmin,
  type AccessLevel,
  type UserPermission,
} from "@/lib/role-permissions";

export function hasVenueScopedPermission(
  permissions: UserPermission[],
  moduleKey: string,
  featureKey: string,
  minLevel: AccessLevel,
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some((p) => {
    if (p.module_key !== moduleKey || p.feature_key !== featureKey) return false;
    if (p.venue_id !== null && p.venue_id !== venueId) return false;
    return hasPermission([p], moduleKey, featureKey, minLevel);
  });
}

/** True if the user can see a module tile at the active venue. */
export function canAccessModule(
  permissions: UserPermission[],
  moduleKey: string,
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  const features = getFeaturesForModule(moduleKey);
  if (features.length === 0) return false;

  return features.some((f) =>
    hasVenueScopedPermission(permissions, moduleKey, f.key, "view", venueId),
  );
}
