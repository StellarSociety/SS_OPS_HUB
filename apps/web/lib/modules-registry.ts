import type { LucideIcon } from "lucide-react";

export type ModuleNavItem = {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
};

/**
 * Central registry for pluggable modules. Business modules register here later.
 */
export const modulesRegistry: ModuleNavItem[] = [];

export function getModuleNavItems(): ModuleNavItem[] {
  return modulesRegistry;
}
