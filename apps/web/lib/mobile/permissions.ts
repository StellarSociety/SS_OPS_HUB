import {
  canAccessModule,
  hasVenueScopedFeatureAccess,
} from "@/lib/module-access";
import type { UserPermission } from "@/lib/role-permissions";
import { MOBILE_APP_FEATURES, MOBILE_APP_MODULE_KEY } from "./types";

export function canAccessMobileApp(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return canAccessModule(permissions, MOBILE_APP_MODULE_KEY, venueId);
}

export function canAccessSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    MOBILE_APP_MODULE_KEY,
    MOBILE_APP_FEATURES.settings,
    venueId,
  );
}
