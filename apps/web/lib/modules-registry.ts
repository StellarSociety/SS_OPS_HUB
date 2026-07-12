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

/**
 * Global per-app display state, controlled from Global settings → Apps.
 * - live           → normal, clickable
 * - coming_soon    → "Coming soon" stamp, not clickable
 * - visible_locked → faded icon, visible but access path blocked
 * - hidden         → removed entirely from the Apps Hub
 */
export type AppModuleState =
  | "live"
  | "coming_soon"
  | "visible_locked"
  | "hidden";

export const APP_MODULE_STATES: {
  key: AppModuleState;
  label: string;
  description: string;
}[] = [
  {
    key: "coming_soon",
    label: "Coming soon",
    description: "Show the app with a “Coming soon” stamp. Not clickable.",
  },
  {
    key: "visible_locked",
    label: "Visible, not accessible",
    description: "Fade the icon and block the access path.",
  },
  {
    key: "hidden",
    label: "Hidden",
    description: "Remove the app entirely from the Apps Hub.",
  },
];

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
  description: string;
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
    description:
      "Build and complete checklists, opening and closing forms, and standard procedures so every shift follows the same steps.",
  },
  {
    key: "team_projects",
    label: "Team Projects & Tasks",
    iconKey: "folder-kanban",
    category: "operational",
    status: "coming_soon",
    description:
      "Plan projects, assign tasks, and track progress across the team with clear ownership and due dates.",
  },
  {
    key: "maintenance",
    label: "Maintenance",
    iconKey: "wrench",
    category: "operational",
    status: "coming_soon",
    description:
      "Log equipment issues, schedule repairs, and keep assets running with a full maintenance history.",
  },
  {
    key: "sentiment",
    label: "Sentiment",
    iconKey: "smile",
    category: "operational",
    status: "coming_soon",
    description:
      "Capture guest and staff feedback to spot trends and act on how people feel about the venue.",
  },
  {
    key: "sales",
    label: "Sales & Revenue",
    iconKey: "trending-up",
    category: "revenue",
    href: "/sales",
    status: "live",
    description:
      "Track daily sales, revenue trends, and performance against targets across the venue.",
  },
  {
    key: "gp_cos",
    label: "GP & COS",
    iconKey: "calculator",
    category: "revenue",
    status: "coming_soon",
    description:
      "Monitor gross profit and cost of sales to understand margins on every product and category.",
  },
  {
    key: "accounting",
    label: "Accounting",
    iconKey: "landmark",
    category: "revenue",
    status: "coming_soon",
    description:
      "Manage invoices, expenses, and financial records to keep the books accurate and up to date.",
  },
  {
    key: "hr",
    label: "Human Resources",
    iconKey: "users",
    category: "people",
    href: "/hr",
    status: "live",
    description:
      "Manage staff records, roles, contracts, and everything related to your people in one place.",
  },
  {
    key: "learning",
    label: "Learning & Development",
    iconKey: "graduation-cap",
    category: "people",
    status: "coming_soon",
    description:
      "Deliver training, track certifications, and grow your team's skills over time.",
  },
  {
    key: "venue_governance",
    label: "Venue Governance",
    iconKey: "building-2",
    category: "management",
    status: "coming_soon",
    description:
      "Central oversight of venue policies, standards, and configuration for leadership.",
  },
  {
    key: "approvals",
    label: "Approvals",
    iconKey: "check-circle-2",
    category: "management",
    status: "coming_soon",
    description:
      "Review and sign off on requests, changes, and workflows that need management approval.",
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
