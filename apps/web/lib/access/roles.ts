import type {
  ModuleAccessRecord,
  PermissionGrantInput,
  UserListRow,
} from "@/lib/access/types";
import {
  APP_MODULE_KEY,
  getAssignableModules,
  getSensitiveFeaturesForModule,
  getSettingsFeatureForModule,
  getSubPagesForModule,
} from "@/lib/modules-catalog";
import type { AccessLevel } from "@/lib/role-permissions";

/**
 * The access model has two role tiers:
 *  - Account role: hub-wide privileges (user management). Stored against the
 *    internal `app` module.
 *  - Per-app role: what the user can do inside a specific app.
 *
 * Both are persisted in `user_module_access` and expanded into concrete
 * `user_permissions` rows for RLS enforcement (the "hybrid" model).
 */
export type AppRole = "app_admin" | "editor" | "viewer";
export type AccountRole = "none" | "venue_admin" | "global_admin";
export type AnyRole = AppRole | AccountRole;

export const APP_ROLE_OPTIONS: {
  value: AppRole;
  label: string;
  description: string;
}[] = [
  {
    value: "app_admin",
    label: "App Admin",
    description: "Adjust app settings, submit & export — plus everything below.",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Submit forms and export files, but cannot edit settings.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "View only. Cannot export files or submit forms.",
  },
];

export const ACCOUNT_ROLE_OPTIONS: {
  value: AccountRole;
  label: string;
  description: string;
}[] = [
  {
    value: "none",
    label: "Standard user",
    description: "No hub-wide privileges — access is defined per app below.",
  },
  {
    value: "venue_admin",
    label: "Venue Admin",
    description: "Manage users & settings for a specific venue.",
  },
  {
    value: "global_admin",
    label: "Global Admin",
    description: "Full control across the entire hub, all venues.",
  },
];

export function appRoleLabel(role: string): string {
  return APP_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function accountRoleLabel(role: string): string {
  return ACCOUNT_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function appRoleToLevel(role: AppRole): AccessLevel {
  switch (role) {
    case "app_admin":
      return "admin";
    case "editor":
      return "edit";
    case "viewer":
    default:
      return "view";
  }
}

export function isAdminRole(role: AppRole): boolean {
  return role === "app_admin";
}

/** Per-app access configuration produced by the access editor. */
export type ModuleAccessConfig = {
  moduleKey: string;
  enabled: boolean;
  role: AppRole;
  suspended: boolean;
  /** Venue scope: null = all venues (group-wide). */
  venueId: string | null;
  /** Layer 3 — selected sub-pages (feature keys). */
  subPages: string[];
  /** Layer 4 — selected sensitive content (feature keys). */
  sensitive: string[];
};

export type AccessEditorState = {
  accountRole: AccountRole;
  /** Venue scope for a venue_admin account role (ignored for others). */
  accountVenueId: string | null;
  modules: ModuleAccessConfig[];
};

export type ModuleAccessRow = {
  module_key: string;
  venue_id: string | null;
  role: AnyRole;
  enabled: boolean;
  suspended: boolean;
};

export type ExpandedAccess = {
  grants: PermissionGrantInput[];
  moduleAccess: ModuleAccessRow[];
};

/**
 * Expand the editor state into the concrete rows written to the database:
 *  - `grants` -> user_permissions (RLS enforcement)
 *  - `moduleAccess` -> user_module_access (role + enable + suspend state)
 */
export function expandAccess(state: AccessEditorState): ExpandedAccess {
  const grants: PermissionGrantInput[] = [];
  const moduleAccess: ModuleAccessRow[] = [];

  // Account-level role -> internal `app` module.
  if (state.accountRole === "global_admin") {
    grants.push({
      module_key: APP_MODULE_KEY,
      feature_key: "global",
      access_level: "admin",
      venue_id: null,
    });
    moduleAccess.push({
      module_key: APP_MODULE_KEY,
      venue_id: null,
      role: "global_admin",
      enabled: true,
      suspended: false,
    });
  } else if (state.accountRole === "venue_admin") {
    grants.push({
      module_key: APP_MODULE_KEY,
      feature_key: "settings",
      access_level: "admin",
      venue_id: state.accountVenueId,
    });
    moduleAccess.push({
      module_key: APP_MODULE_KEY,
      venue_id: state.accountVenueId,
      role: "venue_admin",
      enabled: true,
      suspended: false,
    });
  }

  for (const mod of state.modules) {
    if (!mod.enabled) continue;
    const level = appRoleToLevel(mod.role);

    moduleAccess.push({
      module_key: mod.moduleKey,
      venue_id: mod.venueId,
      role: mod.role,
      enabled: true,
      suspended: mod.suspended,
    });

    const validSubPages = new Set(
      getSubPagesForModule(mod.moduleKey).map((f) => f.key),
    );
    for (const key of mod.subPages) {
      if (!validSubPages.has(key)) continue;
      grants.push({
        module_key: mod.moduleKey,
        feature_key: key,
        access_level: level,
        venue_id: mod.venueId,
      });
    }

    const validSensitive = new Set(
      getSensitiveFeaturesForModule(mod.moduleKey).map((f) => f.key),
    );
    for (const key of mod.sensitive) {
      if (!validSensitive.has(key)) continue;
      grants.push({
        module_key: mod.moduleKey,
        feature_key: key,
        access_level: level,
        venue_id: mod.venueId,
      });
    }

    // Admin-tier per-app role also gets the settings surface.
    if (isAdminRole(mod.role)) {
      const settings = getSettingsFeatureForModule(mod.moduleKey);
      if (settings) {
        grants.push({
          module_key: mod.moduleKey,
          feature_key: settings.key,
          access_level: "admin",
          venue_id: mod.venueId,
        });
      }
    }
  }

  return { grants, moduleAccess };
}

/** A default (empty) per-app config for a module. */
export function defaultModuleConfig(
  moduleKey: string,
  venueId: string | null = null,
): ModuleAccessConfig {
  return {
    moduleKey,
    enabled: false,
    role: "viewer",
    suspended: false,
    venueId,
    subPages: getSubPagesForModule(moduleKey).map((f) => f.key),
    sensitive: [],
  };
}

function levelToRole(level: AccessLevel): AppRole {
  if (level === "admin") return "app_admin";
  if (level === "edit" || level === "submit") return "editor";
  return "viewer";
}

const LEVEL_RANK: Record<AccessLevel, number> = {
  submit: 1,
  view: 1,
  edit: 2,
  admin: 3,
};

/**
 * Rebuild the editor state for an existing user from their stored module access
 * and permission grants. Falls back to inferring from grants for legacy users
 * created before the module-access table existed.
 */
export function buildEditorState(user: UserListRow): AccessEditorState {
  const moduleAccess = user.moduleAccess ?? [];
  const grants = user.permissions ?? [];

  // Account role.
  let accountRole: AccountRole = "none";
  let accountVenueId: string | null = null;
  const appAccess = moduleAccess.find((m) => m.module_key === APP_MODULE_KEY);
  if (appAccess?.role === "global_admin" || appAccess?.role === "venue_admin") {
    accountRole = appAccess.role;
    accountVenueId = appAccess.venue_id;
  } else if (
    grants.some(
      (g) =>
        g.module_key === APP_MODULE_KEY &&
        g.feature_key === "global" &&
        g.access_level === "admin",
    )
  ) {
    accountRole = "global_admin";
  } else {
    const venueAdminGrant = grants.find(
      (g) =>
        g.module_key === APP_MODULE_KEY &&
        g.feature_key === "settings" &&
        g.access_level === "admin",
    );
    if (venueAdminGrant) {
      accountRole = "venue_admin";
      accountVenueId = venueAdminGrant.venue_id;
    }
  }

  const modules: ModuleAccessConfig[] = getAssignableModules().map((mod) => {
    const access = moduleAccess.find(
      (m) => m.module_key === mod.key && m.role !== "global_admin" && m.role !== "venue_admin",
    ) as (ModuleAccessRecord & { role: AppRole }) | undefined;

    const modGrants = grants.filter((g) => g.module_key === mod.key);
    const subPageKeys = new Set(getSubPagesForModule(mod.key).map((f) => f.key));
    const sensitiveKeys = new Set(
      getSensitiveFeaturesForModule(mod.key).map((f) => f.key),
    );

    const selectedSubPages = modGrants
      .map((g) => g.feature_key)
      .filter((k) => subPageKeys.has(k));
    const selectedSensitive = modGrants
      .map((g) => g.feature_key)
      .filter((k) => sensitiveKeys.has(k));

    if (access) {
      return {
        moduleKey: mod.key,
        enabled: access.enabled,
        role: access.role,
        suspended: access.suspended,
        venueId: access.venue_id,
        subPages: selectedSubPages,
        sensitive: selectedSensitive,
      } satisfies ModuleAccessConfig;
    }

    if (modGrants.length > 0) {
      const topLevel = modGrants.reduce<AccessLevel>((acc, g) => {
        return LEVEL_RANK[g.access_level] > LEVEL_RANK[acc] ? g.access_level : acc;
      }, "view");
      return {
        moduleKey: mod.key,
        enabled: true,
        role: levelToRole(topLevel),
        suspended: false,
        venueId: modGrants[0]!.venue_id,
        subPages: selectedSubPages,
        sensitive: selectedSensitive,
      } satisfies ModuleAccessConfig;
    }

    return defaultModuleConfig(mod.key);
  });

  return { accountRole, accountVenueId, modules };
}
