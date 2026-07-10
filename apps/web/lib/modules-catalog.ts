import type { AccessLevel } from "@/lib/role-permissions";

export type ModuleFeatureDef = {
  moduleKey: string;
  featureKey: string;
  label: string;
  description?: string;
};

export type ModuleFeatureEntry = {
  key: string;
  label: string;
  description?: string;
};

export type ModuleDef = {
  key: string;
  label: string;
  description?: string;
  features: ModuleFeatureEntry[];
};

/** App-wide admin features (not venue-scoped in the registry). */
export const APP_MODULE_KEY = "app" as const;

export const moduleCatalog: ModuleDef[] = [
  {
    key: APP_MODULE_KEY,
    label: "App",
    description: "Global hub administration",
    features: [
      { key: "global", label: "Global admin", description: "Full app-wide control" },
      { key: "settings", label: "Settings", description: "App settings access" },
      { key: "admin", label: "Admin", description: "Legacy admin alias" },
    ],
  },
  {
    key: "checklists",
    label: "Operational Checklists",
    features: [
      { key: "shift_report", label: "Shift report" },
      { key: "opening", label: "Opening duties" },
      { key: "closing", label: "Closing duties" },
    ],
  },
  {
    key: "sales",
    label: "Sales & Revenue",
    features: [
      { key: "venue_daily", label: "Venue daily sales" },
      { key: "waiter_daily", label: "Waiter daily sales" },
      { key: "closing_report", label: "Closing report" },
    ],
  },
  {
    key: "hr",
    label: "Human Resources",
    features: [
      { key: "staff", label: "Staff directory" },
      { key: "lookups", label: "Lookups" },
      { key: "salary", label: "Salary & sensitive data" },
    ],
  },
  {
    key: "venue_ops",
    label: "Venue Ops",
    features: [
      { key: "legal_docs", label: "Legal documents" },
      { key: "contractors", label: "Contractors" },
      { key: "maintenance", label: "Maintenance" },
    ],
  },
  {
    key: "gp_cos",
    label: "GP & COS",
    features: [
      { key: "invoices", label: "Invoices" },
      { key: "food_cost", label: "Food cost" },
      { key: "beverages_cost", label: "Beverages cost" },
    ],
  },
  {
    key: "management",
    label: "Management",
    features: [
      { key: "approvals", label: "Approvals" },
    ],
  },
];

/** Modules that can be toggled per venue (excludes app-wide admin). */
export const VENUE_TOGGLEABLE_MODULES = moduleCatalog.filter(
  (m) => m.key !== APP_MODULE_KEY,
);

export function getModuleCatalog(): ModuleDef[] {
  return moduleCatalog;
}

export function getModuleFeaturesFlat(): ModuleFeatureDef[] {
  return moduleCatalog.flatMap((mod) =>
    mod.features.map((f) => ({
      moduleKey: mod.key,
      featureKey: f.key,
      label: f.label,
      description: f.description,
    })),
  );
}

export function getFeaturesForModule(moduleKey: string) {
  return moduleCatalog.find((m) => m.key === moduleKey)?.features ?? [];
}

export function getModuleLabel(moduleKey: string): string {
  return moduleCatalog.find((m) => m.key === moduleKey)?.label ?? moduleKey;
}

export function isModuleEnabledForVenue(
  venueModules: { module_key: string; enabled: boolean }[],
  moduleKey: string,
): boolean {
  const row = venueModules.find((m) => m.module_key === moduleKey);
  return row?.enabled ?? true;
}

export type ModuleNavItem = {
  key: string;
  label: string;
  href: string;
  allowedRoles?: AccessLevel[];
};
