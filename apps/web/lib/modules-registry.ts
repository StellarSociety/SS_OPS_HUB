import {
  Briefcase,
  Calculator,
  ClipboardList,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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

export type ModuleOverviewItem = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  status: ModuleStatus;
};

export type ModuleNavItem = {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
  allowedRoles?: AccessLevel[];
};

export type DashboardWidgetDef = {
  key: string;
  moduleKey: string;
  title: string;
  scope: "venue" | "global" | "both";
  requiredFeature: { moduleKey: string; featureKey: string; minLevel?: AccessLevel };
  load: () => Promise<React.ComponentType<DashboardWidgetProps>>;
};

export type DashboardWidgetProps = {
  venueId: string;
  isGlobalVenue: boolean;
  leadDays?: number;
};

/** All hub modules for the overview grid (§2A). */
export const moduleOverviewRegistry: ModuleOverviewItem[] = [
  {
    key: "checklists",
    label: "Operational Checklists",
    description: "Shift reports, opening & closing duties.",
    icon: ClipboardList,
    status: "coming_soon",
  },
  {
    key: "sales",
    label: "Sales & Revenue",
    description: "Daily sales records & closing reports.",
    icon: TrendingUp,
    status: "coming_soon",
  },
  {
    key: "hr",
    label: "Human Resources",
    description: "Staff, departments, documents, expiries.",
    icon: Users,
    href: "/hr",
    status: "live",
  },
  {
    key: "venue_ops",
    label: "Venue Ops",
    description: "Legal docs, contractors, maintenance.",
    icon: Wrench,
    status: "coming_soon",
  },
  {
    key: "gp_cos",
    label: "GP & COS",
    description: "Invoices, food & beverage cost.",
    icon: Calculator,
    status: "coming_soon",
  },
  {
    key: "management",
    label: "Management",
    description: "Approvals, accounts, P&L, projects.",
    icon: Briefcase,
    status: "coming_soon",
  },
];

/** Live modules for sidebar / deep links. */
export const modulesRegistry: ModuleNavItem[] = moduleOverviewRegistry
  .filter((m) => m.status === "live" && m.href)
  .map((m) => ({
    key: m.key,
    label: m.label,
    href: m.href!,
    icon: m.icon,
    description: m.description,
    allowedRoles: ["view", "edit", "admin", "submit"],
  }));

const dashboardWidgets: DashboardWidgetDef[] = [
  {
    key: "hr-expiry",
    moduleKey: "hr",
    title: "HR expiries",
    scope: "both",
    requiredFeature: { moduleKey: "hr", featureKey: "staff", minLevel: "view" },
    load: async () => {
      const mod = await import("@/components/hr/hr-expiry-dashboard-widget");
      return mod.HrExpiryDashboardWidget;
    },
  },
];

export function getModuleOverviewItems(): ModuleOverviewItem[] {
  return moduleOverviewRegistry;
}

export function getModuleNavItems(): ModuleNavItem[] {
  return modulesRegistry;
}

export function getDashboardWidgets(): DashboardWidgetDef[] {
  return dashboardWidgets;
}

export function getModuleByKey(key: string) {
  return modulesRegistry.find((m) => m.key === key);
}

export function getOverviewModuleByKey(key: string) {
  return moduleOverviewRegistry.find((m) => m.key === key);
}
