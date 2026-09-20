import {
  defaultModuleConfig,
  type AppRole,
  type ModuleAccessConfig,
} from "@/lib/access/roles";
import { MOBILE_APP_MODULE_KEY } from "@/lib/mobile/types";
import {
  getEditorSwitchKeysForModule,
  getSubPagesForModule,
  INTERNAL_ASSIGNABLE_MODULE_KEYS,
  MOBILE_EMPLOYEE_HUB_MODULE_KEY,
} from "@/lib/modules-catalog";
import {
  getModuleOverviewByCategory,
  hubModuleSortIndex,
  type ModuleCategoryKey,
} from "@/lib/modules-registry";

const MATRIX_CATEGORY_ORDER: ModuleCategoryKey[] = [
  "people",
  "operational",
  "revenue",
  "management",
];

export type AccessMatrixLevel = "hidden" | "none" | "viewer" | "editor";

export const ACCESS_MATRIX_LEVELS: {
  value: AccessMatrixLevel;
  label: string;
  short: string;
}[] = [
  { value: "hidden", label: "Hidden", short: "H" },
  { value: "none", label: "No access", short: "N" },
  { value: "viewer", label: "Viewer", short: "V" },
  { value: "editor", label: "Editor", short: "E" },
];

export type AccessMatrixAppColumn = {
  key: string;
  label: string;
  category: string;
};

/** Welcome-screen apps (excludes the Mobile App admin module). */
export function getAccessMatrixAppColumns(): AccessMatrixAppColumn[] {
  return MATRIX_CATEGORY_ORDER.flatMap((categoryKey) => {
    const group = getModuleOverviewByCategory().find(
      (entry) => entry.category.key === categoryKey,
    );
    if (!group) return [];
    return group.modules
      .filter((mod) => mod.key !== MOBILE_APP_MODULE_KEY)
      .sort((a, b) => hubModuleSortIndex(a.key) - hubModuleSortIndex(b.key))
      .map((mod) => ({
        key: mod.key,
        label: mod.label,
        category: group.category.label,
      }));
  });
}

export function matrixLevelFromConfig(
  config: ModuleAccessConfig | undefined,
): AccessMatrixLevel {
  if (!config) return "none";
  if (config.hidden) return "hidden";
  if (!config.enabled) return "none";
  if (config.role === "viewer") return "viewer";
  return "editor";
}

function defaultSubPages(moduleKey: string): string[] {
  return getSubPagesForModule(moduleKey).map((feature) => feature.key);
}

export function applyMatrixLevel(
  config: ModuleAccessConfig,
  level: AccessMatrixLevel,
  venueId: string | null,
): ModuleAccessConfig {
  const scopedVenueId = config.venueId ?? venueId;

  if (level === "hidden") {
    return {
      ...config,
      enabled: false,
      hidden: true,
      venueId: scopedVenueId,
    };
  }

  if (level === "none") {
    return {
      ...config,
      enabled: false,
      hidden: false,
      venueId: scopedVenueId,
    };
  }

  const role: AppRole =
    level === "editor" && config.role === "app_admin" ? "app_admin" : level;
  const editorKeys = getEditorSwitchKeysForModule(config.moduleKey);
  const subPages =
    config.subPages.length > 0
      ? config.subPages
      : defaultSubPages(config.moduleKey);
  const editPages =
    role === "viewer"
      ? []
      : config.role !== "viewer" && (config.editPages?.length ?? 0) > 0
        ? config.editPages
        : subPages.filter((key) => editorKeys.has(key));

  return {
    ...config,
    enabled: true,
    hidden: false,
    role,
    subPages,
    editPages,
    venueId: scopedVenueId,
  };
}

export function ensureMobileAppEnabled(
  modules: ModuleAccessConfig[],
  venueId: string | null,
): ModuleAccessConfig[] {
  return modules.map((mod) => {
    if (mod.moduleKey !== MOBILE_APP_MODULE_KEY || mod.enabled) return mod;
    return applyMatrixLevel(
      mod.subPages.length > 0 ? mod : defaultModuleConfig(mod.moduleKey, venueId),
      "viewer",
      venueId,
    );
  });
}

export function isWebAppSummaryModule(moduleKey: string): boolean {
  return (
    moduleKey !== MOBILE_APP_MODULE_KEY &&
    !INTERNAL_ASSIGNABLE_MODULE_KEYS.has(moduleKey)
  );
}

export function webAppAccessCount(modules: ModuleAccessConfig[]): number {
  return modules.filter(
    (mod) => mod.enabled && !mod.hidden && isWebAppSummaryModule(mod.moduleKey),
  ).length;
}

export function employeeHubLevelFromState(
  modules: ModuleAccessConfig[],
): AccessMatrixLevel {
  const hub = modules.find((mod) => mod.moduleKey === MOBILE_EMPLOYEE_HUB_MODULE_KEY);
  const mobile = modules.find((mod) => mod.moduleKey === MOBILE_APP_MODULE_KEY);
  if (hub?.hidden) return "hidden";
  if (hub?.enabled) return matrixLevelFromConfig(hub);
  if (hub && hub.venueId != null) return "none";
  if (mobile?.enabled && !mobile.hidden) return "viewer";
  return "none";
}

export { MOBILE_EMPLOYEE_HUB_MODULE_KEY };
