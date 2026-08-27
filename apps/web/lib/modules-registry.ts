import type { ModuleIconKey } from "@/lib/module-icons";
import {
  moduleCategories,
  type ModuleCategory,
  type ModuleCategoryKey,
  moduleCategoryMeta,
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
  APP_MODULE_KEY,
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
    key: "team_connect",
    label: "Connecteam",
    iconKey: "messages-square",
    category: "operational",
    status: "coming_soon",
    description:
      "Internal messages, announcements, and shift updates so the whole team stays aligned.",
  },
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
    label: "Tasks & Projects",
    iconKey: "list-todo",
    category: "operational",
    status: "coming_soon",
    description:
      "Plan projects, assign tasks, and track progress across the team with clear ownership and due dates.",
  },
  {
    key: "events",
    label: "Events",
    iconKey: "calendar-days",
    category: "operational",
    status: "coming_soon",
    description:
      "Plan venue events, private bookings, and special occasions from one place.",
  },
  {
    key: "sentiment",
    label: "Sentiment",
    iconKey: "scan-face",
    category: "operational",
    href: "/sentiment",
    status: "live",
    description:
      "Gather and manage guest reviews from Google, TripAdvisor, and other channels.",
  },
  {
    key: "guests_intel",
    label: "Guests Intel",
    iconKey: "guests-intel",
    category: "operational",
    href: "/guests-intel",
    status: "live",
    description:
      "Collect guest details in the hub or via a shareable QR form, then issue a redeemable pass for promotions, vouchers, discounts, or complementary items.",
  },
  {
    key: "save_log",
    label: "SafeLog",
    iconKey: "notebook-pen",
    category: "operational",
    href: "/save-log",
    status: "live",
    description:
      "Upload and manage HACCP daily records — temperature logs, receiving, cleaning, and other food-safety checks.",
  },
  {
    key: "cookbook",
    label: "Cookbook",
    iconKey: "cooking-pot",
    category: "operational",
    status: "coming_soon",
    description:
      "Recipes, dishes, and kitchen standards for the venue in one place.",
  },
  {
    key: "poorbook",
    label: "Pourbook",
    iconKey: "martini",
    category: "operational",
    status: "coming_soon",
    description:
      "Cocktail recipes and bar management, plus wine and spirits training cards.",
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
    key: "sales",
    label: "Revenue",
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
    iconKey: "chart-pie",
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
    href: "/accounting",
    status: "live",
    description:
      "Double-entry ledger, AP/AR, banking, VAT, and financial reports for each legal entity.",
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
    key: "vault",
    label: "Vault",
    iconKey: "vault-safe",
    category: "management",
    status: "coming_soon",
    description:
      "Secure storage for confidential venue documents, contracts, and records.",
  },
  {
    key: "approvals",
    label: "Approvals",
    iconKey: "stamp",
    category: "management",
    status: "coming_soon",
    description:
      "Review and sign off on requests, changes, and workflows that need management approval.",
  },
  {
    key: "mobile_app",
    label: "Mobile App",
    iconKey: "smartphone",
    category: "management",
    href: "/mobile",
    status: "live",
    description:
      "Venue operations on a phone — reviews, approvals, and daily tools in a compact app.",
  },
];

/**
 * Apps Hub icon rows (flattened, independent of category grouping).
 * Unknown keys append on the last row.
 */
export const HUB_MODULE_ROWS: string[][] = [
  ["team_connect", "operational_lists", "team_projects", "events", "sentiment", "guests_intel", "save_log"],
  ["cookbook", "poorbook", "sales", "gp_cos", "accounting", "hr", "learning"],
  ["venue_governance", "vault", "maintenance", "approvals", "mobile_app"],
];

export const HUB_MODULE_ORDER: string[] = HUB_MODULE_ROWS.flat();

export function hubModuleSortIndex(key: string): number {
  const index = HUB_MODULE_ORDER.indexOf(key);
  return index === -1 ? HUB_MODULE_ORDER.length : index;
}

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

/** Best link target for a module tile or access list (live app, category hub, or settings). */
export function getModuleEntryHref(moduleKey: string): string {
  const overview = getOverviewModuleByKey(moduleKey);
  if (overview?.href) return overview.href;
  if (overview?.category) return moduleCategoryMeta[overview.category].href;
  if (moduleKey === APP_MODULE_KEY) return "/settings";
  return "/modules";
}

export function getModulesByCategory(category: ModuleCategoryKey): ModuleOverviewItem[] {
  return moduleOverviewRegistry.filter((m) => m.category === category);
}
