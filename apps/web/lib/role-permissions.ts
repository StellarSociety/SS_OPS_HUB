export type AccessLevel = "admin" | "edit" | "view" | "submit";

export type UserPermission = {
  id: string;
  user_id: string;
  venue_id: string | null;
  module_key: string;
  feature_key: string;
  access_level: AccessLevel;
};

/** Ladder for read/write breadth: view < edit < admin. Submit is not on this ladder. */
const LADDER_LEVELS: AccessLevel[] = ["view", "edit", "admin"];

/** Any non-empty grant, including submit-only. */
const ENTRY_LEVELS: AccessLevel[] = ["submit", "view", "edit", "admin"];

function hasAppAdminGrant(
  permissions: UserPermission[],
  featureKeys: readonly string[],
): boolean {
  return permissions.some(
    (p) =>
      p.module_key === "app" &&
      featureKeys.includes(p.feature_key) &&
      p.access_level === "admin",
  );
}

/** Hub-wide superuser. Bypasses per-app grants. Global Admin only. */
export function isGlobalAdmin(permissions: UserPermission[]): boolean {
  return hasAppAdminGrant(permissions, ["global", "admin"]);
}

/**
 * Venue Admin account role (`app` / `settings`). Can manage users and hub
 * settings, but must still be granted each operational app.
 */
export function isVenueAdmin(permissions: UserPermission[]): boolean {
  return hasAppAdminGrant(permissions, ["settings"]);
}

/** Settings / user-management access: Global Admin or Venue Admin. */
export function canManageHubSettings(permissions: UserPermission[]): boolean {
  return isGlobalAdmin(permissions) || isVenueAdmin(permissions);
}

/**
 * Superuser check used by module gates. Venue Admin is not a superuser —
 * turning Mobile App (or any other app) off must actually block them.
 */
export function isAppAdmin(permissions: UserPermission[]): boolean {
  return isGlobalAdmin(permissions);
}

export function canAccessGlobal(permissions: UserPermission[]): boolean {
  return isGlobalAdmin(permissions);
}

/** Ladder check: view/edit/admin only. Submit does not satisfy view or higher. */
export function hasPermission(
  permissions: UserPermission[],
  moduleKey: string,
  featureKey: string,
  minLevel: AccessLevel = "view",
): boolean {
  const minIndex = LADDER_LEVELS.indexOf(minLevel);
  if (minIndex === -1) return false;

  return permissions.some((p) => {
    if (p.module_key !== moduleKey || p.feature_key !== featureKey) return false;
    const levelIndex = LADDER_LEVELS.indexOf(p.access_level);
    return levelIndex >= 0 && levelIndex >= minIndex;
  });
}

/** Entry-capable: submit OR any ladder level (view/edit/admin). */
export function hasFeatureAccess(
  permissions: UserPermission[],
  moduleKey: string,
  featureKey: string,
): boolean {
  return permissions.some(
    (p) =>
      p.module_key === moduleKey &&
      p.feature_key === featureKey &&
      ENTRY_LEVELS.includes(p.access_level),
  );
}

/** Submit-only grant (create + read/edit own rows). Does not include view/edit/admin. */
export function hasSubmitGrant(
  permissions: UserPermission[],
  moduleKey: string,
  featureKey: string,
): boolean {
  return permissions.some(
    (p) =>
      p.module_key === moduleKey &&
      p.feature_key === featureKey &&
      p.access_level === "submit",
  );
}
