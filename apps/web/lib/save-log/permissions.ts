import {
  canAccessModule,
  hasVenueScopedFeatureAccess,
  hasVenueScopedPermission,
} from "@/lib/module-access";
import type { UserPermission } from "@/lib/role-permissions";
import { SAVE_LOG_FEATURES, SAVE_LOG_MODULE_KEY } from "./types";

export function canAccessSaveLog(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return canAccessModule(permissions, SAVE_LOG_MODULE_KEY, venueId);
}

export function canAccessOverview(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    SAVE_LOG_MODULE_KEY,
    SAVE_LOG_FEATURES.overview,
    venueId,
  );
}

export function canAccessLogs(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    SAVE_LOG_MODULE_KEY,
    SAVE_LOG_FEATURES.logs,
    venueId,
  );
}

export function canEditLogs(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    SAVE_LOG_MODULE_KEY,
    SAVE_LOG_FEATURES.logs,
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
    SAVE_LOG_MODULE_KEY,
    SAVE_LOG_FEATURES.settings,
    venueId,
  );
}

export function canAdminSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    SAVE_LOG_MODULE_KEY,
    SAVE_LOG_FEATURES.settings,
    "admin",
    venueId,
  );
}

export function firstAccessibleSaveLogPath(
  permissions: UserPermission[],
  venueId: string,
): string | null {
  if (canAccessOverview(permissions, venueId)) return "/save-log";
  if (canAccessLogs(permissions, venueId)) return "/save-log/logs";
  if (canAccessSettings(permissions, venueId)) return "/save-log/settings";
  return null;
}
