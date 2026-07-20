import type { AccessLevel } from "@/lib/role-permissions";

/**
 * A single permission target within a module.
 *
 * Features double as the Layer 3 (sub-pages) and Layer 4 (sensitive content)
 * units of the access model:
 *  - a normal feature = a sub-page the user can reach
 *  - `sensitive: true` = Layer 4 sensitive content, opt-in even for a role
 *  - `settings: true`  = app-settings surface, granted only to admin-tier roles
 *
 * The `key` values for live modules (hr, sales) are stable and referenced by
 * RLS policies — do not rename existing ones.
 */
export type ModuleFeatureEntry = {
  key: string;
  label: string;
  description?: string;
  /** Route for this sub-page (live modules only). */
  href?: string;
  /** Layer 4 — sensitive content, never granted implicitly by a role. */
  sensitive?: boolean;
  /** App-settings surface — only admin-tier roles receive it. */
  settings?: boolean;
};

export type ModuleFeatureDef = {
  moduleKey: string;
  featureKey: string;
  label: string;
  description?: string;
  sensitive?: boolean;
  settings?: boolean;
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
      { key: "settings", label: "Settings", description: "App settings access", settings: true },
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
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "team_projects",
    label: "Team Projects & Tasks",
    description: "Projects, tasks, and team coordination.",
    features: [
      { key: "projects", label: "Projects & tasks" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    description: "Equipment, facilities, and maintenance requests.",
    features: [
      { key: "requests", label: "Requests" },
      { key: "assets", label: "Assets & equipment" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "sentiment",
    label: "Sentiment",
    description: "Guest and team sentiment tracking.",
    features: [
      { key: "guest", label: "Guest sentiment" },
      { key: "team", label: "Team sentiment" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "sales",
    label: "Sales & Revenue",
    description: "Daily sales records & closing reports.",
    features: [
      { key: "overview", label: "Overview dashboards", href: "/sales", description: "KPI dashboards & charts" },
      { key: "venue_daily", label: "Daily Sales", href: "/sales/daily" },
      { key: "waiter_daily", label: "Waiter Sales", href: "/sales/waiter" },
      { key: "daily_vs_waiters", label: "Verification", href: "/sales/daily-vs-waiters/figures-verification" },
      { key: "cash_drawer", label: "Discounts", href: "/sales/discounts" },
      { key: "forecast", label: "Forecasts", href: "/sales/forecast" },
      { key: "cash_up", label: "Daily Snap", href: "/sales/daily-snap" },
      { key: "revenue_figures", label: "Revenue figures", description: "Net revenue & totals", sensitive: true },
      { key: "settings", label: "Settings", href: "/sales/settings", settings: true },
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
      { key: "margins", label: "Margins & GP", sensitive: true },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "accounting",
    label: "Accounting",
    description: "Accounts, ledgers, and financial records.",
    features: [
      { key: "accounts", label: "Accounts" },
      { key: "ledgers", label: "Ledgers" },
      { key: "statements", label: "Statements", sensitive: true },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "hr",
    label: "Human Resources",
    description: "Staff, departments, documents, expiries.",
    features: [
      { key: "overview", label: "Overview", href: "/hr" },
      { key: "staff", label: "Staff directory", href: "/hr/staff" },
      { key: "insurance", label: "Insurance", href: "/hr/insurance" },
      { key: "certifications", label: "Certifications", href: "/hr/certifications" },
      { key: "schedules", label: "Schedules", href: "/hr/schedules" },
      {
        key: "attendance_insights",
        label: "Attendance insights",
        href: "/hr/attendance/insights",
      },
      { key: "attendance", label: "Attendance", href: "/hr/attendance" },
      {
        key: "attendance_validation",
        label: "Attendance validation",
        href: "/hr/attendance/validation",
      },
      { key: "leave", label: "Leave", href: "/hr/attendance/leave" },
      { key: "payroll", label: "Payroll", href: "/hr/payroll" },
      { key: "benefits", label: "Benefits", href: "/hr/benefits" },
      { key: "payslips", label: "Payslips", href: "/hr/payslips" },
      { key: "expenses", label: "Expenses", href: "/hr/expenses" },
      { key: "onboarding", label: "On-boarding", href: "/hr/onboarding" },
      { key: "communications", label: "Communications", href: "/hr/communications" },
      { key: "offboarding", label: "Off-boarding", href: "/hr/offboarding" },
      { key: "lookups", label: "Lookups" },
      {
        key: "salary",
        label: "Salary & sensitive data",
        description:
          "Compensation (wage package, accommodation, basic/allowances, salary to pay, fly-home ticket), expenses & EOSB, medical insurance value, bank details, passport/EID and date of birth.",
        sensitive: true,
      },
      {
        key: "schedule_approval",
        label: "Schedule Approval",
        description:
          "Can be selected as a weekly schedule approver. Approvers revise the roster and confirm publish so Editors can download the schedule PDF.",
        sensitive: true,
      },
      { key: "settings", label: "Settings", href: "/hr/settings", settings: true },
    ],
  },
  {
    key: "learning",
    label: "Learning & Development",
    description: "Training, courses, and staff development.",
    features: [
      { key: "courses", label: "Courses" },
      { key: "progress", label: "Progress tracking" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "venue_governance",
    label: "Venue Governance",
    description: "Legal docs, contractors, and venue compliance.",
    features: [
      { key: "legal_docs", label: "Legal documents", sensitive: true },
      { key: "contractors", label: "Contractors" },
      { key: "compliance", label: "Compliance" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "approvals",
    label: "Approvals",
    description: "Workflow approvals and sign-offs.",
    features: [
      { key: "approvals", label: "Approvals" },
      { key: "settings", label: "Settings", settings: true },
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

/** Live-facing modules for the access editor (excludes the internal app module). */
export function getAssignableModules(): ModuleDef[] {
  return VENUE_TOGGLEABLE_MODULES;
}

export function getModuleDef(moduleKey: string): ModuleDef | undefined {
  return moduleCatalog.find((m) => m.key === moduleKey);
}

export function getModuleFeaturesFlat(): ModuleFeatureDef[] {
  return moduleCatalog.flatMap((mod) =>
    mod.features.map((f) => ({
      moduleKey: mod.key,
      featureKey: f.key,
      label: f.label,
      description: f.description,
      sensitive: f.sensitive,
      settings: f.settings,
    })),
  );
}

export function getFeaturesForModule(moduleKey: string): ModuleFeatureEntry[] {
  return moduleCatalog.find((m) => m.key === moduleKey)?.features ?? [];
}

/** Layer 3 — sub-pages: normal features (not sensitive, not settings). */
export function getSubPagesForModule(moduleKey: string): ModuleFeatureEntry[] {
  return getFeaturesForModule(moduleKey).filter(
    (f) => !f.sensitive && !f.settings,
  );
}

/** Layer 4 — sensitive content within a module. */
export function getSensitiveFeaturesForModule(
  moduleKey: string,
): ModuleFeatureEntry[] {
  return getFeaturesForModule(moduleKey).filter((f) => f.sensitive);
}

export function getSettingsFeatureForModule(
  moduleKey: string,
): ModuleFeatureEntry | undefined {
  return getFeaturesForModule(moduleKey).find((f) => f.settings);
}

export function getFeatureDef(
  moduleKey: string,
  featureKey: string,
): ModuleFeatureEntry | undefined {
  return getFeaturesForModule(moduleKey).find((f) => f.key === featureKey);
}

export function getModuleLabel(moduleKey: string): string {
  return moduleCatalog.find((m) => m.key === moduleKey)?.label ?? moduleKey;
}

export function getFeatureLabel(moduleKey: string, featureKey: string): string {
  return getFeatureDef(moduleKey, featureKey)?.label ?? featureKey;
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
