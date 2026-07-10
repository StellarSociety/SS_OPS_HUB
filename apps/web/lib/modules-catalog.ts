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
    key: "operational_lists",
    label: "Operational Lists & Forms",
    description: "Shift reports, opening & closing duties.",
    features: [
      { key: "shift_report", label: "Shift report" },
      { key: "opening", label: "Opening duties" },
      { key: "closing", label: "Closing duties" },
    ],
  },
  {
    key: "team_projects",
    label: "Team Projects & Tasks",
    description: "Projects, tasks, and team coordination.",
    features: [{ key: "projects", label: "Projects & tasks" }],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    description: "Equipment, facilities, and maintenance requests.",
    features: [{ key: "maintenance", label: "Maintenance" }],
  },
  {
    key: "sentiment",
    label: "Sentiment",
    description: "Guest and team sentiment tracking.",
    features: [{ key: "sentiment", label: "Sentiment" }],
  },
  {
    key: "sales",
    label: "Sales & Revenue",
    description: "Daily sales records & closing reports.",
    features: [
      { key: "venue_daily", label: "Daily Sales" },
      { key: "waiter_daily", label: "Waiter Sales" },
      { key: "cash_drawer", label: "Discounts" },
      { key: "cash_up", label: "Daily Snap" },
    ],
  },
  {
    key: "gp_cos",
    label: "GP & COS",
    description: "Invoices, food & beverage cost.",
    features: [
      { key: "invoices", label: "Invoices" },
      { key: "food_cost", label: "Food cost" },
      { key: "beverages_cost", label: "Beverages cost" },
    ],
  },
  {
    key: "accounting",
    label: "Accounting",
    description: "Accounts, ledgers, and financial records.",
    features: [{ key: "accounts", label: "Accounts" }],
  },
  {
    key: "hr",
    label: "Human Resources",
    description: "Staff, departments, documents, expiries.",
    features: [
      { key: "staff", label: "Staff directory" },
      { key: "lookups", label: "Lookups" },
      { key: "salary", label: "Salary & sensitive data" },
    ],
  },
  {
    key: "learning",
    label: "Learning & Development",
    description: "Training, courses, and staff development.",
    features: [{ key: "training", label: "Training" }],
  },
  {
    key: "venue_governance",
    label: "Venue Governance",
    description: "Legal docs, contractors, and venue compliance.",
    features: [
      { key: "legal_docs", label: "Legal documents" },
      { key: "contractors", label: "Contractors" },
    ],
  },
  {
    key: "approvals",
    label: "Approvals",
    description: "Workflow approvals and sign-offs.",
    features: [{ key: "approvals", label: "Approvals" }],
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
  return row?.enabled ?? false;
}

export type ModuleNavItem = {
  key: string;
  label: string;
  href: string;
  allowedRoles?: AccessLevel[];
};
