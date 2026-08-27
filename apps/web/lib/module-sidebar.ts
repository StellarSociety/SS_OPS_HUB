import {
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  Camera,
  Coins,
  FileBarChart,
  GitCompareArrows,
  Gift,
  Landmark,
  QrCode,
  ScanQrCode,
  LayoutDashboard,
  LineChart,
  MessageSquareHeart,
  MessageSquareQuote,
  MessagesSquare,
  ScanFace,
  Percent,
  Receipt,
  ReceiptText,
  FileText,
  Settings,
  Smartphone,
  Tablet,
  Tag,
  Ticket,
  TrendingUp,
  UserMinus,
  UserPlus,
  UserRound,
  UserRoundSearch,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GuestsIntel } from "@/components/modules/guests-intel-icon";
import { SafeLogHaccp } from "@/components/modules/safelog-haccp-icon";

export type ModuleSidebarItem = {
  label: string;
  /**
   * Navigation target. Prefer a real page (not a redirect hub) — soft-nav into
   * `redirect()` routes can trip React's "Rendered more hooks…" error.
   */
  href: string;
  /**
   * When set, active-state matching uses this prefix instead of `href`
   * (so `/hr/staff/entry` stays active on `/hr/staff/insights`, etc.).
   */
  activePathPrefix?: string;
  /** Paths under `activePathPrefix` that should not mark this item active. */
  excludePathPrefixes?: string[];
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
      {
        label: "Overview",
        href: "/hr",
        exact: true,
        icon: LayoutDashboard,
        dividerAfter: true,
      },
      {
        label: "Staff directory",
        href: "/hr/staff/entry",
        activePathPrefix: "/hr/staff",
        icon: Users,
      },
      {
        label: "Staff Compliance",
        href: "/hr/assets",
        icon: BadgeCheck,
        dividerAfter: true,
      },
      { label: "Schedules", href: "/hr/schedules", icon: CalendarDays },
      {
        label: "Attendance",
        href: "/hr/attendance/validation",
        activePathPrefix: "/hr/attendance",
        excludePathPrefixes: ["/hr/attendance/leave"],
        icon: CalendarCheck,
      },
      {
        label: "Leave",
        href: "/hr/attendance/leave/balances",
        activePathPrefix: "/hr/attendance/leave",
        icon: CalendarOff,
        dividerAfter: true,
      },
      { label: "Benefits", href: "/hr/benefits/gratuity", activePathPrefix: "/hr/benefits", icon: Gift },
      { label: "Payroll", href: "/hr/payroll", icon: Wallet },
      { label: "Payslips", href: "/hr/payslips", icon: ReceiptText },
      { label: "Expenses", href: "/hr/expenses", icon: Receipt },
      {
        label: "Hiring",
        href: "/hr/hiring",
        icon: UserRoundSearch,
        comingSoon: true,
      },
      { label: "Communications", href: "/hr/communications", icon: MessagesSquare, activePathPrefix: "/hr/communications" },
      { label: "ON-Boarding", href: "/hr/onboarding", icon: UserPlus },
      { label: "OFF-Boarding", href: "/hr/offboarding", icon: UserMinus },
    ],
    bottomItems: [
      {
        label: "Settings",
        href: "/hr/settings/staff-details/departments",
        activePathPrefix: "/hr/settings",
        icon: Settings,
      },
    ],
    categories: [
      {
        key: "staff-details",
        label: "Staff Details",
        icon: UserRound,
        itemHrefs: [
          "/hr/staff/entry",
          "/hr/assets",
        ],
      },
      {
        key: "attendance",
        label: "Attendance",
        icon: CalendarCheck,
        itemHrefs: [
          "/hr/schedules",
          "/hr/attendance/validation",
          "/hr/attendance/leave/balances",
        ],
      },
      {
        key: "pay",
        label: "Pay",
        icon: Wallet,
        itemHrefs: [
          "/hr/benefits/gratuity",
          "/hr/payroll",
          "/hr/payslips",
          "/hr/expenses",
        ],
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
    label: "Revenue",
    icon: TrendingUp,
    items: [
      {
        label: "Overview",
        href: "/sales",
        exact: true,
        icon: LayoutDashboard,
        dividerAfter: true,
      },
      { label: "Daily Sales", href: "/sales/daily", icon: Coins },
      { label: "Waiter Sales", href: "/sales/waiter", icon: UserRound },
      {
        label: "Verification",
        href: "/sales/daily-vs-waiters/figures-verification",
        icon: GitCompareArrows,
      },
      { label: "Discounts", href: "/sales/discounts", icon: Tag },
      {
        label: "Cash",
        href: "/sales/cash/journal",
        activePathPrefix: "/sales/cash",
        icon: Wallet,
        dividerAfter: true,
      },
      {
        label: "TAX Collections",
        href: "/sales/tax-collections",
        icon: Percent,
        comingSoon: true,
      },
      { label: "Forecasts", href: "/sales/forecast", icon: LineChart },
      { label: "Vouchers", href: "/sales/vouchers", icon: Ticket, dividerAfter: true },
      { label: "Daily Snap", href: "/sales/daily-snap", icon: Camera },
      { label: "Reports", href: "/sales/reports", icon: FileBarChart, dividerAfter: true },
    ],
    bottomItems: [
      { label: "Settings", href: "/sales/settings", icon: Settings },
    ],
  },
  {
    moduleKey: "accounting",
    basePath: "/accounting",
    label: "Accounting",
    icon: Landmark,
    items: [
      {
        label: "Overview",
        href: "/accounting",
        exact: true,
        icon: LayoutDashboard,
      },
      {
        label: "Invoice Issue",
        href: "/accounting/invoices",
        activePathPrefix: "/accounting/invoices",
        icon: FileText,
      },
    ],
    bottomItems: [
      { label: "Settings", href: "/accounting/settings", icon: Settings },
    ],
  },
  {
    moduleKey: "sentiment",
    basePath: "/sentiment",
    label: "Sentiment",
    icon: ScanFace,
    items: [
      {
        label: "Dashboard",
        href: "/sentiment",
        exact: true,
        icon: LayoutDashboard,
        dividerAfter: true,
      },
      {
        label: "Reviews",
        href: "/sentiment/reviews?period=week",
        activePathPrefix: "/sentiment/reviews",
        icon: MessageSquareQuote,
      },
      {
        label: "Feedback Form",
        href: "/sentiment/guest-feedback",
        activePathPrefix: "/sentiment/guest-feedback",
        icon: MessageSquareHeart,
      },
      {
        label: "Calendar",
        href: "/sentiment/calendar",
        icon: CalendarDays,
      },
      {
        label: "Actions",
        href: "/sentiment/actions",
        icon: ClipboardList,
      },
      {
        label: "Live Display",
        href: "/sentiment/live-display",
        activePathPrefix: "/sentiment/live-display",
        icon: Tablet,
      },
    ],
    bottomItems: [
      {
        label: "Settings",
        href: "/sentiment/settings",
        icon: Settings,
      },
    ],
  },
  {
    moduleKey: "guests_intel",
    basePath: "/guests-intel",
    label: "Guests Intel",
    icon: GuestsIntel,
    items: [
      {
        label: "Dashboard",
        href: "/guests-intel",
        exact: true,
        icon: LayoutDashboard,
        dividerAfter: true,
      },
      {
        label: "Collect",
        href: "/guests-intel/collect",
        icon: QrCode,
      },
      {
        label: "Guests",
        href: "/guests-intel/guests",
        activePathPrefix: "/guests-intel/guests",
        icon: UserRound,
      },
      {
        label: "Rewards",
        href: "/guests-intel/rewards",
        icon: Gift,
      },
      {
        label: "Redeem",
        href: "/guests-intel/redeem",
        icon: ScanQrCode,
      },
    ],
    bottomItems: [
      {
        label: "Settings",
        href: "/guests-intel/settings",
        icon: Settings,
      },
    ],
  },
  {
    moduleKey: "save_log",
    basePath: "/save-log",
    label: "SafeLog",
    icon: SafeLogHaccp,
    items: [
      {
        label: "Dashboard",
        href: "/save-log",
        exact: true,
        icon: LayoutDashboard,
        dividerAfter: true,
      },
      {
        label: "Daily Logs",
        href: "/save-log/logs",
        activePathPrefix: "/save-log/logs",
        icon: SafeLogHaccp,
      },
    ],
    bottomItems: [
      {
        label: "Settings",
        href: "/save-log/settings",
        icon: Settings,
      },
    ],
  },
  {
    moduleKey: "mobile_app",
    basePath: "/mobile",
    label: "Mobile App",
    icon: Smartphone,
    items: [
      {
        label: "Mobile",
        href: "/mobile",
        exact: true,
        icon: Smartphone,
      },
      {
        label: "Users Access",
        href: "/mobile/users-access",
        icon: Users,
      },
    ],
    bottomItems: [
      {
        label: "Settings",
        href: "/mobile/settings",
        icon: Settings,
      },
    ],
  },
];

export function isModuleSidebarItemActive(
  pathname: string,
  item: ModuleSidebarItem,
): boolean {
  const matchBase = item.activePathPrefix ?? item.href;
  if (
    item.excludePathPrefixes?.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }
  if (item.exact) {
    return pathname === matchBase;
  }
  if (pathname === matchBase || pathname === item.href) {
    return true;
  }
  return (
    pathname.startsWith(`${matchBase}/`) ||
    pathname.startsWith(`${item.href}/`)
  );
}

export function getModuleSidebarForPath(pathname: string): ModuleSidebarDef | null {
  return (
    moduleSidebarRegistry.find((def) => pathname.startsWith(def.basePath)) ?? null
  );
}

export function getModuleSidebarByKey(moduleKey: string): ModuleSidebarDef | null {
  return (
    moduleSidebarRegistry.find((def) => def.moduleKey === moduleKey) ?? null
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
  return "Operational Hub";
}
