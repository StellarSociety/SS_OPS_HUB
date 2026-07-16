import {
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Camera,
  Coins,
  GitCompareArrows,
  Gift,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  Percent,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  Tag,
  TrendingUp,
  UserMinus,
  UserPlus,
  UserRound,
  UserRoundSearch,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ModuleSidebarItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  exact?: boolean;
  /** Render a divider directly after this item to visually group the nav. */
  dividerAfter?: boolean;
  /** Show a diagonal "coming soon" tag and disable navigation. */
  comingSoon?: boolean;
};

/**
 * Groups a module's nav items into named categories. When present, the module
 * shortcuts bar renders a compact set of category tabs that expand to reveal
 * their items instead of listing every item as a pill.
 */
export type ModuleSidebarCategory = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Hrefs of the items (from `items`) that belong to this category, in order. */
  itemHrefs: string[];
};

export type ModuleSidebarDef = {
  moduleKey: string;
  basePath: string;
  label: string;
  icon: LucideIcon;
  items: ModuleSidebarItem[];
  bottomItems?: ModuleSidebarItem[];
  categories?: ModuleSidebarCategory[];
};

/** Per-module sidebar navigation (shown when inside a live module). */
export const moduleSidebarRegistry: ModuleSidebarDef[] = [
  {
    moduleKey: "hr",
    basePath: "/hr",
    label: "Human Resources",
    icon: Users,
    items: [
      { label: "Overview", href: "/hr", exact: true, icon: LayoutDashboard },
      { label: "Staff directory", href: "/hr/staff", icon: Users },
      { label: "Insurance", href: "/hr/insurance", icon: ShieldCheck },
      {
        label: "Certifications",
        href: "/hr/certifications",
        icon: GraduationCap,
        dividerAfter: true,
      },
      { label: "Schedules", href: "/hr/schedules", icon: CalendarDays },
      { label: "Attendance", href: "/hr/attendance", icon: CalendarCheck },
      {
        label: "Leave",
        href: "/hr/attendance/leave",
        icon: CalendarOff,
        dividerAfter: true,
      },
      { label: "Payroll", href: "/hr/payroll", icon: Wallet },
      { label: "Benefits", href: "/hr/benefits", icon: Gift },
      { label: "Payslips", href: "/hr/payslips", icon: ReceiptText },
      {
        label: "Expenses",
        href: "/hr/expenses",
        icon: Receipt,
        dividerAfter: true,
      },
      {
        label: "Hiring",
        href: "/hr/hiring",
        icon: UserRoundSearch,
        comingSoon: true,
      },
      { label: "Communications", href: "/hr/communications", icon: MessagesSquare },
      { label: "ON-Boarding", href: "/hr/onboarding", icon: UserPlus },
      { label: "OFF-Boarding", href: "/hr/offboarding", icon: UserMinus },
    ],
    bottomItems: [
      { label: "Settings", href: "/hr/settings", icon: Settings },
    ],
    categories: [
      {
        key: "staff-details",
        label: "Staff Details",
        icon: UserRound,
        itemHrefs: ["/hr/staff", "/hr/insurance", "/hr/certifications"],
      },
      {
        key: "attendance",
        label: "Attendance",
        icon: CalendarCheck,
        itemHrefs: [
          "/hr/schedules",
          "/hr/attendance/insights",
          "/hr/attendance",
          "/hr/attendance/validation",
          "/hr/attendance/leave",
        ],
      },
      {
        key: "pay",
        label: "Pay",
        icon: Wallet,
        itemHrefs: ["/hr/payroll", "/hr/benefits", "/hr/payslips", "/hr/expenses"],
      },
      {
        key: "boarding",
        label: "Boarding",
        icon: UserPlus,
        itemHrefs: [
          "/hr/hiring",
          "/hr/communications",
          "/hr/onboarding",
          "/hr/offboarding",
        ],
      },
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
      { label: "Discounts", href: "/sales/discounts", icon: Tag },
      {
        label: "TAX Collections",
        href: "/sales/tax-collections",
        icon: Percent,
        comingSoon: true,
      },
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
