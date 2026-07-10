import Link from "next/link";
import { Users } from "lucide-react";
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
  /** venue = only on venue dashboards; global = only global; both = everywhere */
  scope: "venue" | "global" | "both";
  requiredFeature: { moduleKey: string; featureKey: string; minLevel?: AccessLevel };
  load: () => Promise<React.ComponentType<DashboardWidgetProps>>;
};

export type DashboardWidgetProps = {
  venueId: string;
  isGlobalVenue: boolean;
  leadDays?: number;
};

export const modulesRegistry: ModuleNavItem[] = [
  {
    key: "hr",
    label: "Human Resources",
    href: "/hr",
    icon: Users,
    description: "Staff directory, lookups, document & training expiries",
    allowedRoles: ["view", "edit", "admin", "submit"],
  },
];

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

export function getModuleNavItems(): ModuleNavItem[] {
  return modulesRegistry;
}

export function getDashboardWidgets(): DashboardWidgetDef[] {
  return dashboardWidgets;
}

export function getModuleByKey(key: string) {
  return modulesRegistry.find((m) => m.key === key);
}
