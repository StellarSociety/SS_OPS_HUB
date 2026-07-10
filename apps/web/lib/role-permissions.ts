export type AccessLevel = "admin" | "edit" | "view" | "submit";

export type UserPermission = {
  id: string;
  user_id: string;
  venue_id: string | null;
  module_key: string;
  feature_key: string;
  access_level: AccessLevel;
};

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

export function hasPermission(
  permissions: UserPermission[],
  moduleKey: string,
  featureKey: string,
  minLevel: AccessLevel = "view",
): boolean {
  const levels: AccessLevel[] = ["submit", "view", "edit", "admin"];
  const minIndex = levels.indexOf(minLevel);

  return permissions.some((p) => {
    if (p.module_key !== moduleKey || p.feature_key !== featureKey) return false;
    return levels.indexOf(p.access_level) >= minIndex;
  });
}
