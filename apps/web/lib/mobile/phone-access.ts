import "server-only";

import type { AccessMatrixLevel } from "@/lib/access/matrix";
import { MOBILE_APP_MODULE_KEY } from "@/lib/mobile/types";
import {
  getSubPagesForModule,
  MOBILE_EMPLOYEE_HUB_MODULE_KEY,
} from "@/lib/modules-catalog";
import type { UserPermission } from "@/lib/role-permissions";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Phone (mobile app) access — kept apart from web app access.
 *
 * Stored in `mobile_app_access`, one row per person / venue / phone app:
 * - `mobile_app`          the "Can use the mobile app" switch ("viewer" = on)
 * - `mobile_employee_hub` Personal Employee Hub, with the pages it opens
 * - any other key         a welcome-screen app (sales, sentiment, directory, …)
 *
 * The phone never reads web grants for this. Instead the switches are turned
 * into a phone-only permission list, so the existing page checks
 * (canAccessOverview, canAccessHiring, …) apply the mobile settings.
 * The switches apply to everyone, admins included.
 */

export const PHONE_APP_SWITCH_KEY = MOBILE_APP_MODULE_KEY;
export const PHONE_HUB_KEY = MOBILE_EMPLOYEE_HUB_MODULE_KEY;

export type PhoneAccessRow = {
  app_key: string;
  level: AccessMatrixLevel;
  pages: string[] | null;
};

export type PhoneAccess = {
  canUseApp: boolean;
  /** Level per phone app key, including the Employee Hub. Missing = "none". */
  levels: Record<string, AccessMatrixLevel>;
  /** Employee Hub pages this person can open. */
  hubPages: string[];
  /** Phone-only permissions built from the switches. */
  permissions: UserPermission[];
};

type ServiceClient = ReturnType<typeof createServiceClient>;

export function employeeHubPageKeys(): string[] {
  return getSubPagesForModule(PHONE_HUB_KEY).map((page) => page.key);
}

function isGranted(level: AccessMatrixLevel | undefined) {
  return level === "viewer" || level === "editor";
}

function grant(
  userId: string,
  venueId: string,
  moduleKey: string,
  featureKey: string,
  accessLevel: "view" | "edit",
): UserPermission {
  return {
    id: `phone:${moduleKey}:${featureKey}`,
    user_id: userId,
    venue_id: venueId,
    module_key: moduleKey,
    feature_key: featureKey,
    access_level: accessLevel,
  };
}

/** Turn the phone switches into the permissions phone pages check against. */
export function phonePermissionsFromRows(
  userId: string,
  venueId: string,
  rows: PhoneAccessRow[],
): UserPermission[] {
  const byKey = new Map(rows.map((row) => [row.app_key, row]));
  if (!isGranted(byKey.get(PHONE_APP_SWITCH_KEY)?.level)) return [];

  const permissions: UserPermission[] = [
    grant(userId, venueId, MOBILE_APP_MODULE_KEY, "app", "view"),
  ];

  for (const row of rows) {
    if (row.app_key === PHONE_APP_SWITCH_KEY || !isGranted(row.level)) continue;
    const editor = row.level === "editor";
    if (row.app_key === PHONE_HUB_KEY) {
      for (const page of row.pages ?? employeeHubPageKeys()) {
        permissions.push(
          grant(userId, venueId, PHONE_HUB_KEY, page, editor ? "edit" : "view"),
        );
      }
      continue;
    }
    // Every ordinary page of the app; sensitive and settings pages stay web-only.
    for (const feature of getSubPagesForModule(row.app_key)) {
      permissions.push(
        grant(
          userId,
          venueId,
          row.app_key,
          feature.key,
          editor && !feature.viewOnly ? "edit" : "view",
        ),
      );
    }
  }
  return permissions;
}

export async function loadPhoneAccessRows(
  service: ServiceClient,
  userId: string,
  venueId: string,
): Promise<PhoneAccessRow[]> {
  const { data, error } = await service
    .from("mobile_app_access")
    .select("app_key, level, pages")
    .eq("user_id", userId)
    .eq("venue_id", venueId);
  if (error) {
    console.error("[phone-access] load:", error.message);
    return [];
  }
  return (data ?? []) as PhoneAccessRow[];
}

export async function loadPhoneAccess(
  userId: string,
  venueId: string,
  service: ServiceClient = createServiceClient(),
): Promise<PhoneAccess> {
  const rows = await loadPhoneAccessRows(service, userId, venueId);
  const levels: Record<string, AccessMatrixLevel> = {};
  for (const row of rows) levels[row.app_key] = row.level;
  const hubRow = rows.find((row) => row.app_key === PHONE_HUB_KEY);
  const canUseApp = isGranted(levels[PHONE_APP_SWITCH_KEY]);
  return {
    canUseApp,
    levels,
    hubPages: canUseApp && isGranted(hubRow?.level)
      ? hubRow?.pages ?? employeeHubPageKeys()
      : [],
    permissions: phonePermissionsFromRows(userId, venueId, rows),
  };
}

/** Venues where this person may use the phone app. */
export async function phoneVenueIds(
  userId: string,
  service: ServiceClient = createServiceClient(),
): Promise<Set<string>> {
  const { data } = await service
    .from("mobile_app_access")
    .select("venue_id, level")
    .eq("user_id", userId)
    .eq("app_key", PHONE_APP_SWITCH_KEY);
  return new Set(
    (data ?? [])
      .filter((row) => isGranted(row.level as AccessMatrixLevel))
      .map((row) => String(row.venue_id)),
  );
}

/** People with the phone app switched on at a venue. */
export async function listPhoneAppUserIds(
  service: ServiceClient,
  venueId: string,
): Promise<Set<string>> {
  const { data } = await service
    .from("mobile_app_access")
    .select("user_id, level")
    .eq("venue_id", venueId)
    .eq("app_key", PHONE_APP_SWITCH_KEY);
  return new Set(
    (data ?? [])
      .filter((row) => isGranted(row.level as AccessMatrixLevel))
      .map((row) => String(row.user_id)),
  );
}

/** Every phone switch at a venue, grouped by person (for the access matrix). */
export async function loadVenuePhoneAccessRows(
  service: ServiceClient,
  venueId: string,
): Promise<Map<string, PhoneAccessRow[]>> {
  const { data, error } = await service
    .from("mobile_app_access")
    .select("user_id, app_key, level, pages")
    .eq("venue_id", venueId);
  const byUser = new Map<string, PhoneAccessRow[]>();
  if (error) {
    console.error("[phone-access] venue rows:", error.message);
    return byUser;
  }
  for (const row of data ?? []) {
    const userId = String(row.user_id);
    const list = byUser.get(userId) ?? [];
    list.push({
      app_key: String(row.app_key),
      level: row.level as AccessMatrixLevel,
      pages: (row.pages as string[] | null) ?? null,
    });
    byUser.set(userId, list);
  }
  return byUser;
}
