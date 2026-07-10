import type { ModuleIconKey } from "@/lib/module-icons";
import {
  moduleCategories,
  type ModuleCategory,
  type ModuleCategoryKey,
} from "@/lib/module-categories";
import type { AccessLevel } from "@/lib/role-permissions";
import {
  getFeaturesForModule,
  getModuleCatalog,
  getModuleFeaturesFlat,
  getModuleLabel,
  isModuleEnabledForVenue,
  moduleCatalog,
  VENUE_TOGGLEABLE_MODULES,
  type ModuleDef,
  type ModuleFeatureDef,
} from "@/lib/modules-catalog";
import { notificationSettingsMeta } from "@/lib/notifications/registry";

export type { ModuleDef, ModuleFeatureDef };
export {
  getFeaturesForModule,
  getModuleCatalog,
  getModuleFeaturesFlat,
  getModuleLabel,
  isModuleEnabledForVenue,
  moduleCatalog,
  VENUE_TOGGLEABLE_MODULES,
};

export type ModuleStatus = "live" | "coming_soon";

export type { ModuleCategoryKey, ModuleCategory } from "@/lib/module-categories";
export {
  moduleCategories,
  moduleCategoryMeta,
  isModuleCategoryKey,
  getModuleCategoryMeta,
} from "@/lib/module-categories";

export type ModuleOverviewItem = {
  key: string;
  label: string;
  iconKey: ModuleIconKey;
  category: ModuleCategoryKey;
  href?: string;
  status: ModuleStatus;
};

export type ModuleNavItem = {
  key: string;
  label: string;
  href: string;
  iconKey?: ModuleIconKey;
  description?: string;
  allowedRoles?: AccessLevel[];
};

/** All hub modules for the Operational Apps overview. */
export const moduleOverviewRegistry: ModuleOverviewItem[] = [
  {
    key: "operational_lists",
    label: "Operational Lists & Forms",
    iconKey: "clipboard-list",
    category: "operational",
    status: "coming_soon",
  },
  {
    key: "team_projects",
    label: "Team Projects & Tasks",
    iconKey: "folder-kanban",
    category: "operational",
    status: "coming_soon",
  },
  {
    key: "maintenance",
    label: "Maintenance",
    iconKey: "wrench",
    category: "operational",
    status: "coming_soon",
  },
  {
    key: "sentiment",
    label: "Sentiment",
    iconKey: "smile",
    category: "operational",
    status: "coming_soon",
  },
  {
    key: "sales",
    label: "Sales & Revenue",
    iconKey: "trending-up",
    category: "revenue",
    href: "/sales",
    status: "live",
  },
  {
    key: "gp_cos",
    label: "GP & COS",
    iconKey: "calculator",
    category: "revenue",
    status: "coming_soon",
  },
  {
    key: "accounting",
    label: "Accounting",
    iconKey: "landmark",
    category: "revenue",
    status: "coming_soon",
  },
  {
    key: "hr",
    label: "Human Resources",
    iconKey: "users",
    category: "people",
    href: "/hr",
    status: "live",
  },
  {
    key: "learning",
    label: "Learning & Development",
    iconKey: "graduation-cap",
    category: "people",
    status: "coming_soon",
  },
  {
    key: "venue_governance",
    label: "Venue Governance",
    iconKey: "building-2",
    category: "management",
    status: "coming_soon",
  },
  {
    key: "approvals",
    label: "Approvals",
    iconKey: "check-circle-2",
    category: "management",
    status: "coming_soon",
  },
];

/** Live modules for deep links. */
export const modulesRegistry: ModuleNavItem[] = moduleOverviewRegistry
  .filter((m) => m.status === "live" && m.href)
  .map((m) => ({
    key: m.key,
    label: m.label,
    href: m.href!,
    iconKey: m.iconKey,
    allowedRoles: ["view", "edit", "admin", "submit"],
  }));

export function getModuleOverviewItems(): ModuleOverviewItem[] {
  return moduleOverviewRegistry;
}

export function getModuleOverviewByCategory(): {
  category: ModuleCategory;
  modules: ModuleOverviewItem[];
}[] {
  return moduleCategories.map((category) => ({
    category,
    modules: moduleOverviewRegistry.filter((m) => m.category === category.key),
  }));
}

export function getModuleNavItems(): ModuleNavItem[] {
  return modulesRegistry;
}

export { notificationSettingsMeta };

export function getModuleByKey(key: string) {
  return modulesRegistry.find((m) => m.key === key);
}

export function getOverviewModuleByKey(key: string) {
  return moduleOverviewRegistry.find((m) => m.key === key);
}

export function getModulesByCategory(category: ModuleCategoryKey): ModuleOverviewItem[] {
  return moduleOverviewRegistry.filter((m) => m.category === category);
}
