import {
  Camera,
  ClipboardList,
  Coins,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  Percent,
  Settings,
  TrendingUp,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ModuleSidebarItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  exact?: boolean;
};

export type ModuleSidebarDef = {
  moduleKey: string;
  basePath: string;
  label: string;
  icon: LucideIcon;
  items: ModuleSidebarItem[];
  bottomItems?: ModuleSidebarItem[];
};

/** Per-module sidebar navigation (shown when inside a live module). */
export const moduleSidebarRegistry: ModuleSidebarDef[] = [
  {
    moduleKey: "hr",
    basePath: "/hr",
    label: "Human Resources",
    icon: Users,
    items: [
      { label: "Staff directory", href: "/hr", exact: true, icon: Users },
      { label: "Import", href: "/hr/import", icon: Upload },
      { label: "Lookups", href: "/hr/lookups", icon: ClipboardList },
    ],
  },
  {
    moduleKey: "sales",
    basePath: "/sales",
    label: "Sales & Revenue",
    icon: TrendingUp,
    items: [
      { label: "Overview", href: "/sales", exact: true, icon: LayoutDashboard },
      { label: "Daily Sales", href: "/sales/daily", icon: Coins },
      { label: "Waiter Sales", href: "/sales/waiter", icon: UserRound },
      {
        label: "Daily vs Waiters",
        href: "/sales/daily-vs-waiters",
        icon: GitCompareArrows,
      },
      { label: "Discounts", href: "/sales/discounts", icon: Percent },
      { label: "Forecasts", href: "/sales/forecast", icon: LineChart },
      { label: "Daily Snap", href: "/sales/daily-snap", icon: Camera },
    ],
    bottomItems: [
      { label: "Settings", href: "/sales/settings", icon: Settings },
    ],
  },
];

export function isModuleSidebarItemActive(
  pathname: string,
  item: ModuleSidebarItem,
): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  if (pathname === item.href) {
    return true;
  }
  return pathname.startsWith(`${item.href}/`);
}

export function getModuleSidebarForPath(pathname: string): ModuleSidebarDef | null {
  return (
    moduleSidebarRegistry.find((def) => pathname.startsWith(def.basePath)) ?? null
  );
}

/** Resolve the sidebar symbol (icon) for a path: the active nav item's icon, falling back to the module icon. */
export function getModuleSidebarIconForPath(pathname: string): LucideIcon | null {
  const moduleSidebar = getModuleSidebarForPath(pathname);
  if (!moduleSidebar) {
    return null;
  }
  const allItems = [
    ...moduleSidebar.items,
    ...(moduleSidebar.bottomItems ?? []),
  ];
  const activeItem = allItems.find((item) =>
    isModuleSidebarItemActive(pathname, item),
  );
  return activeItem?.icon ?? moduleSidebar.icon;
}

export function getAppHeaderTitle(pathname: string): string {
  const moduleSidebar = getModuleSidebarForPath(pathname);
  if (moduleSidebar) {
    return moduleSidebar.label.toUpperCase();
  }
  return "Operational HUB";
}
