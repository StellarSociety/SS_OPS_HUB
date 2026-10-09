import {
  canAccessModule,
  hasVenueScopedFeatureAccess,
  hasVenueScopedPermission,
} from "@/lib/module-access";
import type { UserPermission } from "@/lib/role-permissions";
import {
  CONNECT_FEATURES,
  CONNECT_MODULE_KEY,
  type ConnectGroupRole,
} from "./types";

/** Any grant at this venue (or a global grant) — the "everyone" audience. */
export function hasConnectVenuePresence(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return permissions.some((p) => p.venue_id === null || p.venue_id === venueId);
}

/**
 * Everyone with Hub access at the venue can open Connecteam — what they see
 * inside is decided by group membership ("everyone" groups like Announcements
 * include them automatically).
 */
export function canAccessConnect(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return (
    canAccessModule(permissions, CONNECT_MODULE_KEY, venueId) ||
    hasConnectVenuePresence(permissions, venueId)
  );
}

/** Connecteam Settings: sees every group and opens the settings pages. */
export function canAccessConnectSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedFeatureAccess(
    permissions,
    CONNECT_MODULE_KEY,
    CONNECT_FEATURES.settings,
    venueId,
  );
}

/** Creates / archives groups and manages every group's members. */
export function canAdminConnect(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    permissions,
    CONNECT_MODULE_KEY,
    CONNECT_FEATURES.settings,
    "edit",
    venueId,
  );
}

/**
 * Effective role inside a group. Connecteam settings editors act as group
 * admins everywhere; settings viewers read every group.
 */
export function effectiveGroupRole(
  memberRole: ConnectGroupRole | null,
  isConnectAdmin: boolean,
  autoRole: ConnectGroupRole | null = null,
): ConnectGroupRole | null {
  if (isConnectAdmin) return "admin";
  return memberRole ?? autoRole;
}

export function roleCanPost(role: ConnectGroupRole | null): boolean {
  return role === "admin" || role === "moderator" || role === "contributor";
}

export function roleCanInteract(role: ConnectGroupRole | null): boolean {
  return role !== null;
}

export function roleCanModerate(role: ConnectGroupRole | null): boolean {
  return role === "admin" || role === "moderator";
}

export function roleCanManageGroup(role: ConnectGroupRole | null): boolean {
  return role === "admin";
}
