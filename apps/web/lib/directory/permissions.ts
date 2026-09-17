import {
  canAccessModule,
  hasVenueScopedFeatureAccess,
  hasVenueScopedPermission,
} from "@/lib/module-access";
import type { UserPermission } from "@/lib/role-permissions";
import { DIRECTORY_FEATURES, DIRECTORY_MODULE_KEY } from "./types";

export function canAccessDirectory(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return canAccessModule(permissions, DIRECTORY_MODULE_KEY, venueId);
}

export function canAccessDirectoryStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    DIRECTORY_MODULE_KEY,
    DIRECTORY_FEATURES.staff,
    venueId,
  );
}

export function canAccessDirectoryCelebrations(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    DIRECTORY_MODULE_KEY,
    DIRECTORY_FEATURES.celebrations,
    venueId,
  );
}

export function canAccessDirectoryHierarchy(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    DIRECTORY_MODULE_KEY,
    DIRECTORY_FEATURES.hierarchy,
    venueId,
  );
}

export function canAccessDirectoryHierarchyManagement(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    DIRECTORY_MODULE_KEY,
    DIRECTORY_FEATURES.hierarchy_management,
    venueId,
  );
}

export function canEditDirectoryHierarchy(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    DIRECTORY_MODULE_KEY,
    DIRECTORY_FEATURES.hierarchy,
    "edit",
    venueId,
  );
}

export function firstAccessibleDirectoryPath(
  permissions: UserPermission[],
  venueId: string,
): string | null {
  if (canAccessDirectoryStaff(permissions, venueId)) return "/directory";
  if (canAccessDirectoryCelebrations(permissions, venueId)) {
    return "/directory/celebrations";
  }
  if (canAccessDirectoryHierarchy(permissions, venueId)) {
    return "/directory/hierarchy";
  }
  if (canAccessDirectoryHierarchyManagement(permissions, venueId)) {
    return "/directory/hierarchy-management";
  }
  return null;
}

export function firstAccessibleMobileDirectoryPath(
  permissions: UserPermission[],
  venueId: string,
): string | null {
  return firstAccessibleDirectoryPath(permissions, venueId);
}
