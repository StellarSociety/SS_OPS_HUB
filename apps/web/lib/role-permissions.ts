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

export function isAppAdmin(permissions: UserPermission[]): boolean {
  return permissions.some(
    (p) =>
      p.module_key === "app" &&
      ["global", "admin", "settings"].includes(p.feature_key) &&
      p.access_level === "admin",
  );
}

export function canAccessGlobal(permissions: UserPermission[]): boolean {
  return isAppAdmin(permissions);
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
