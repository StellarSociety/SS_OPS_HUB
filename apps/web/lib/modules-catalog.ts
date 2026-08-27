import type { AccessLevel } from "@/lib/role-permissions";
import {
  getModuleSidebarByKey,
  type ModuleSidebarItem,
} from "@/lib/module-sidebar";

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
export type ModuleFeatureGroupDef = {
  key: string;
  label: string;
};

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
  /**
   * Access-editor group. Matches `featureGroups` on the module so the grant
   * list follows the same structure as the app sidebar.
   */
  group?: string;
  /** Nest this grant under another sub-page (e.g. Insurance under Staff Compliance). */
  parentKey?: string;
  /**
   * Page has no submit/edit surface. The access editor hides the Editor
   * switch (Reports, Overview dashboards, etc.).
   */
  viewOnly?: boolean;
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
  /** Named sections for the access editor (order is display order). */
  featureGroups?: ModuleFeatureGroupDef[];
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
    key: "team_connect",
    label: "Connecteam",
    description: "Internal messages, announcements, and team updates.",
    features: [
      { key: "messages", label: "Messages" },
      { key: "announcements", label: "Announcements" },
      { key: "settings", label: "Settings", settings: true },
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
    label: "Tasks & Projects",
    description: "Tasks, projects, and team coordination.",
    features: [
      { key: "projects", label: "Projects & tasks" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "events",
    label: "Events",
    description: "Venue events, private bookings, and special occasions.",
    features: [
      { key: "events", label: "Events" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "cookbook",
    label: "Cookbook",
    description: "Recipes, dishes, and kitchen standards.",
    features: [
      { key: "recipes", label: "Recipes" },
      { key: "settings", label: "Settings", settings: true },
    ],
  },
  {
    key: "poorbook",
    label: "Pourbook",
    description:
      "Cocktail recipes, bar management, and wine and spirits training cards.",
    features: [
      { key: "cocktails", label: "Cocktails" },
      { key: "wine", label: "Wine" },
      { key: "spirits", label: "Spirits training" },
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
    description: "Guest reviews from Google, TripAdvisor, and other channels.",
    featureGroups: [
      { key: "overview", label: "Overview" },
      { key: "reviews", label: "Reviews" },
      { key: "guest_feedback", label: "Feedback Form" },
      { key: "actions", label: "Actions" },
      { key: "live_display", label: "Live Display" },
    ],
    features: [
      {
        key: "overview",
        label: "Dashboard",
        href: "/sentiment",
        group: "overview",
        viewOnly: true,
      },
      {
        key: "reviews",
        label: "Reviews",
        href: "/sentiment/reviews",
        group: "reviews",
      },
      {
        key: "guest_feedback",
        label: "Feedback Form",
        href: "/sentiment/guest-feedback",
        group: "guest_feedback",
      },
      {
        key: "actions",
        label: "Actions",
        href: "/sentiment/actions",
        group: "actions",
      },
      {
        key: "live_display",
        label: "Live Display",
        href: "/sentiment/live-display",
        group: "live_display",
      },
      {
        key: "settings",
        label: "Settings",
        href: "/sentiment/settings",
        settings: true,
      },
    ],
  },
  {
    key: "guests_intel",
    label: "Guests Intel",
    description:
      "Guest intake, shareable forms, and redeemable promotion passes.",
    featureGroups: [
      { key: "overview", label: "Overview" },
      { key: "collect", label: "Collect" },
      { key: "guests", label: "Guests" },
      { key: "rewards", label: "Rewards" },
    ],
    features: [
      {
        key: "overview",
        label: "Dashboard",
        href: "/guests-intel",
        group: "overview",
        viewOnly: true,
      },
      {
        key: "collect",
        label: "Collect",
        href: "/guests-intel/collect",
        group: "collect",
      },
      {
        key: "guests",
        label: "Guests",
        href: "/guests-intel/guests",
        group: "guests",
      },
      {
        key: "rewards",
        label: "Rewards",
        href: "/guests-intel/rewards",
        group: "rewards",
      },
      {
        key: "redeem",
        label: "Redeem",
        href: "/guests-intel/redeem",
        group: "rewards",
      },
      {
        key: "settings",
        label: "Settings",
        href: "/guests-intel/settings",
        settings: true,
      },
    ],
  },
  {
    key: "save_log",
    label: "SafeLog",
    description: "HACCP daily records — upload, review, and keep food-safety logs.",
    featureGroups: [
      { key: "overview", label: "Overview" },
      { key: "logs", label: "Daily Logs" },
    ],
    features: [
      {
        key: "overview",
        label: "Dashboard",
        href: "/save-log",
        group: "overview",
        viewOnly: true,
      },
      {
        key: "logs",
        label: "Daily Logs",
        href: "/save-log/logs",
        group: "logs",
      },
      {
        key: "settings",
        label: "Settings",
        href: "/save-log/settings",
        settings: true,
      },
    ],
  },
  {
    key: "sales",
    label: "Revenue",
    description: "Daily sales records & closing reports.",
    featureGroups: [
      { key: "overview", label: "Overview" },
      { key: "daily-figures", label: "Daily figures" },
      { key: "planning", label: "Planning" },
      { key: "close-of-day", label: "Close of day" },
    ],
    // Keep hrefs aligned with `module-sidebar.ts`. Live sidebar pages that
    // are missing here are still merged into the access editor automatically.
    features: [
      {
        key: "overview",
        label: "Overview",
        href: "/sales",
        group: "overview",
        viewOnly: true,
      },
      {
        key: "venue_daily",
        label: "Daily Sales",
        href: "/sales/daily",
        group: "daily-figures",
      },
      {
        key: "waiter_daily",
        label: "Waiter Sales",
        href: "/sales/waiter",
        group: "daily-figures",
      },
      {
        key: "daily_vs_waiters",
        label: "Verification",
        href: "/sales/daily-vs-waiters/figures-verification",
        group: "daily-figures",
      },
      {
        key: "cash_drawer",
        label: "Discounts",
        href: "/sales/discounts",
        group: "daily-figures",
      },
      {
        key: "cash",
        label: "Cash",
        href: "/sales/cash/journal",
        group: "daily-figures",
      },
      {
        key: "forecast",
        label: "Forecasts",
        href: "/sales/forecast",
        group: "planning",
      },
      {
        key: "vouchers",
        label: "Vouchers",
        href: "/sales/vouchers",
        group: "planning",
      },
      {
        key: "cash_up",
        label: "Daily Snap",
        href: "/sales/daily-snap",
        group: "close-of-day",
      },
      {
        key: "reports",
        label: "Reports",
        href: "/sales/reports",
        group: "close-of-day",
        viewOnly: true,
      },
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
    description: "General ledger, AP/AR, VAT, and financial reports.",
    features: [
      { key: "overview", label: "Overview", href: "/accounting" },
      { key: "gl", label: "General ledger", href: "/accounting" },
      { key: "ap", label: "Invoices (AP)", href: "/accounting/invoices" },
      { key: "ar", label: "Accounts receivable" },
      { key: "banking", label: "Banking" },
      { key: "sales", label: "Sales & settlements" },
      { key: "inventory", label: "Inventory & COGS" },
      { key: "payroll", label: "Payroll accounting" },
      { key: "fixed-assets", label: "Fixed assets" },
      { key: "tax", label: "Tax & VAT201", sensitive: true },
      { key: "reports", label: "Reports", sensitive: true },
      {
        key: "settings",
        label: "Settings",
        href: "/accounting/settings",
        settings: true,
      },
    ],
  },
  {
    key: "hr",
    label: "Human Resources",
    description: "Staff, departments, documents, expiries.",
    featureGroups: [
      { key: "overview", label: "Overview" },
      { key: "staff-details", label: "Staff Details" },
      { key: "attendance", label: "Attendance" },
      { key: "pay", label: "Pay" },
      { key: "boarding", label: "Boarding" },
    ],
    features: [
      { key: "overview", label: "Overview", href: "/hr", group: "overview", viewOnly: true },
      {
        key: "staff",
        label: "Staff directory",
        href: "/hr/staff/entry",
        group: "staff-details",
      },
      {
        key: "staff_compliance",
        label: "Staff Compliance",
        href: "/hr/assets",
        group: "staff-details",
        description:
          "Uniform, assets, certifications, insurance, and visa.",
        viewOnly: true,
      },
      {
        key: "uniform",
        label: "Uniform",
        href: "/hr/assets/uniform/employees",
        group: "staff-details",
        parentKey: "staff_compliance",
      },
      {
        key: "assets",
        label: "Assets",
        href: "/hr/assets/catalog/employees",
        group: "staff-details",
        parentKey: "staff_compliance",
      },
      {
        key: "certifications",
        label: "Certifications",
        href: "/hr/assets/certifications/employees",
        group: "staff-details",
        parentKey: "staff_compliance",
      },
      {
        key: "insurance",
        label: "Insurance",
        href: "/hr/assets/insurance/employees",
        group: "staff-details",
        parentKey: "staff_compliance",
      },
      {
        key: "visa",
        label: "Visa",
        href: "/hr/assets/visa/employees",
        group: "staff-details",
        parentKey: "staff_compliance",
      },
      {
        key: "lookups",
        label: "Staff lookups",
        group: "staff-details",
        description: "Departments, positions, nationalities, and other lists.",
      },
      {
        key: "schedules",
        label: "Schedules",
        href: "/hr/schedules",
        group: "attendance",
      },
      {
        key: "attendance_validation",
        label: "Attendance validation",
        href: "/hr/attendance/validation",
        group: "attendance",
        description:
          "Open Validation. Editor can correct roster labels. Approving days requires Attendance Validator under Sensitive content.",
      },
      {
        key: "attendance_insights",
        label: "Attendance insights",
        href: "/hr/attendance/insights",
        group: "attendance",
        viewOnly: true,
      },
      {
        key: "attendance",
        label: "Attendance records",
        href: "/hr/attendance/records",
        group: "attendance",
      },
      {
        key: "leave",
        label: "Leave",
        href: "/hr/attendance/leave/balances",
        group: "attendance",
      },
      {
        key: "benefits",
        label: "Benefits",
        href: "/hr/benefits/gratuity",
        group: "pay",
      },
      { key: "payroll", label: "Payroll", href: "/hr/payroll", group: "pay" },
      { key: "payslips", label: "Payslips", href: "/hr/payslips", group: "pay" },
      { key: "expenses", label: "Expenses", href: "/hr/expenses", group: "pay" },
      {
        key: "communications",
        label: "Communications",
        href: "/hr/communications",
        group: "boarding",
      },
      {
        key: "onboarding",
        label: "On-boarding",
        href: "/hr/onboarding",
        group: "boarding",
      },
      {
        key: "offboarding",
        label: "Off-boarding",
        href: "/hr/offboarding",
        group: "boarding",
      },
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
      {
        key: "attendance_validator",
        label: "Attendance Validator",
        description:
          "Can approve attendance days on Validation. Payroll and leave use only approved days. Separate from weekly Schedule Approval — page Editors can still correct roster labels without this grant.",
        sensitive: true,
      },
      {
        key: "settings",
        label: "Settings",
        href: "/hr/settings/staff-details/departments",
        settings: true,
      },
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
    key: "vault",
    label: "Vault",
    description: "Secure documents, contracts, and confidential records.",
    features: [
      { key: "documents", label: "Documents", sensitive: true },
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
  {
    key: "mobile_app",
    label: "Mobile App",
    description: "Venue operations on phones and tablets.",
    features: [
      {
        key: "app",
        label: "Mobile",
        href: "/mobile",
        viewOnly: true,
      },
      {
        key: "settings",
        label: "Settings",
        href: "/mobile/settings",
        settings: true,
      },
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

function featureMatchesSidebarItem(
  feature: ModuleFeatureEntry,
  item: ModuleSidebarItem,
): boolean {
  if (!feature.href) return false;
  const prefix = item.activePathPrefix;
  return Boolean(
    prefix &&
      (feature.href === prefix || feature.href.startsWith(`${prefix}/`)),
  );
}

function featureKeyFromSidebarItem(
  basePath: string,
  item: ModuleSidebarItem,
  usedKeys: Set<string>,
): string {
  const path = (item.activePathPrefix ?? item.href)
    .replace(basePath, "")
    .replace(/^\//, "");
  const slug = path.split("/")[0] || "page";
  const base = slug.replace(/-/g, "_");
  if (!usedKeys.has(base)) return base;
  let suffix = 2;
  while (usedKeys.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function groupFromSidebarItem(
  moduleKey: string,
  item: ModuleSidebarItem,
): string | undefined {
  const categories = getModuleSidebarByKey(moduleKey)?.categories;
  if (!categories) return undefined;
  return categories.find(
    (category) =>
      category.itemHrefs.includes(item.href) ||
      (item.activePathPrefix
        ? category.itemHrefs.includes(item.activePathPrefix)
        : false),
  )?.key;
}

/**
 * Live sidebar pages that are not yet listed in the catalog still appear in
 * the access editor. Coming-soon items stay out until they ship.
 */
function mergeSidebarFeatures(
  moduleKey: string,
  catalog: ModuleFeatureEntry[],
): ModuleFeatureEntry[] {
  const sidebar = getModuleSidebarByKey(moduleKey);
  if (!sidebar) return catalog;

  const usedKeys = new Set(catalog.map((feature) => feature.key));
  const matchedKeys = new Set<string>();
  const extras: ModuleFeatureEntry[] = [];
  let lastGroup: string | undefined;

  for (const item of sidebar.items) {
    const match =
      catalog.find((feature) => feature.href === item.href) ??
      catalog.find((feature) => featureMatchesSidebarItem(feature, item));
    if (match) {
      matchedKeys.add(match.key);
      if (match.group) lastGroup = match.group;
      continue;
    }
    if (item.comingSoon) continue;

    const key = featureKeyFromSidebarItem(sidebar.basePath, item, usedKeys);
    usedKeys.add(key);
    const group = groupFromSidebarItem(moduleKey, item) ?? lastGroup;
    extras.push({
      key,
      label: item.label,
      href: item.href,
      group,
      viewOnly:
        item.exact === true ||
        item.label.toLowerCase() === "overview" ||
        item.label.toLowerCase() === "reports",
    });
    if (group) lastGroup = group;
  }

  if (extras.length === 0) return catalog;

  const pages = catalog.filter((feature) => !feature.sensitive && !feature.settings);
  const trailing = catalog.filter(
    (feature) => feature.sensitive || feature.settings,
  );
  const unmatched = pages.filter((feature) => !matchedKeys.has(feature.key));
  return [...pages.filter((feature) => matchedKeys.has(feature.key)), ...extras, ...unmatched, ...trailing];
}

export function getFeaturesForModule(moduleKey: string): ModuleFeatureEntry[] {
  const catalog = moduleCatalog.find((m) => m.key === moduleKey)?.features ?? [];
  return markHubsViewOnly(mergeSidebarFeatures(moduleKey, catalog));
}

/** Parent pages with nested grants are hubs — no Editor switch of their own. */
function markHubsViewOnly(
  features: ModuleFeatureEntry[],
): ModuleFeatureEntry[] {
  const parentKeys = new Set(
    features
      .map((feature) => feature.parentKey)
      .filter((key): key is string => Boolean(key)),
  );
  if (parentKeys.size === 0) return features;
  return features.map((feature) =>
    parentKeys.has(feature.key) ? { ...feature, viewOnly: true } : feature,
  );
}

/** Layer 3 — sub-pages: normal features (not sensitive, not settings). */
export function getSubPagesForModule(moduleKey: string): ModuleFeatureEntry[] {
  return getFeaturesForModule(moduleKey).filter(
    (f) => !f.sensitive && !f.settings,
  );
}

/** Pages that have a submit/edit surface — show the Editor switch. */
export function featureHasEditorSwitch(
  feature: ModuleFeatureEntry,
  pages: ModuleFeatureEntry[] = [],
): boolean {
  if (feature.viewOnly) return false;
  return !pages.some((page) => page.parentKey === feature.key);
}

export function getEditorSwitchKeysForModule(moduleKey: string): Set<string> {
  const pages = getSubPagesForModule(moduleKey);
  return new Set(
    pages.filter((feature) => featureHasEditorSwitch(feature, pages)).map(
      (feature) => feature.key,
    ),
  );
}

export type GroupedSubPageFeature = ModuleFeatureEntry & {
  children: ModuleFeatureEntry[];
};

export type GroupedSubPages = {
  key: string;
  label: string;
  features: GroupedSubPageFeature[];
};

function withChildren(
  feature: ModuleFeatureEntry,
  pages: ModuleFeatureEntry[],
): GroupedSubPageFeature {
  return {
    ...feature,
    children: pages.filter((page) => page.parentKey === feature.key),
  };
}

function groupedSubPageKeys(feature: GroupedSubPageFeature): string[] {
  return [feature.key, ...feature.children.map((child) => child.key)];
}

/** Keys granted by a grouped sub-page section (parent + nested children). */
export function getGroupedSubPageKeys(group: GroupedSubPages): string[] {
  return group.features.flatMap(groupedSubPageKeys);
}

/**
 * Sub-pages arranged like the app sidebar: named groups, with nested grants
 * (e.g. Insurance under Staff Compliance) hanging off their parent.
 * Modules without `featureGroups` get a single "Sub-pages" section.
 */
export function getGroupedSubPagesForModule(
  moduleKey: string,
): GroupedSubPages[] {
  const mod = getModuleDef(moduleKey);
  const pages = getSubPagesForModule(moduleKey);
  if (!mod || pages.length === 0) return [];

  const nestedKeys = new Set(
    pages
      .filter((page) => page.parentKey && pages.some((p) => p.key === page.parentKey))
      .map((page) => page.key),
  );

  const topLevel = pages.filter((page) => !nestedKeys.has(page.key));
  const groups = mod.featureGroups ?? [];

  if (groups.length === 0) {
    return [
      {
        key: "all",
        label: "Sub-pages",
        features: topLevel.map((feature) => withChildren(feature, pages)),
      },
    ];
  }

  const used = new Set<string>();
  const result: GroupedSubPages[] = [];

  for (const group of groups) {
    const features = topLevel
      .filter((feature) => feature.group === group.key)
      .map((feature) => {
        const grouped = withChildren(feature, pages);
        for (const key of groupedSubPageKeys(grouped)) used.add(key);
        return grouped;
      });
    if (features.length === 0) continue;
    result.push({ key: group.key, label: group.label, features });
  }

  const leftover = topLevel.filter((feature) => !used.has(feature.key));
  if (leftover.length > 0) {
    result.push({
      key: "other",
      label: "Other",
      features: leftover.map((feature) => withChildren(feature, pages)),
    });
  }

  return result;
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
