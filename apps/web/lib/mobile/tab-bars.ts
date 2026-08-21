import {
  Archive,
  Bell,
  CalendarCheck,
  CalendarOff,
  Coins,
  FileBarChart,
  House,
  LayoutDashboard,
  OctagonAlert,
  ReceiptText,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";

export const MOBILE_HOME_TAB_ID = "home" as const;

export type MobileTabItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Device-preview App Path id when this tab has a screen. */
  pageId?: string;
  /** Path under `/m/{venueSlug}`. */
  path: string;
};

/**
 * Apps that own a 5-icon bar. Home is prepended and is never listed here.
 * Every phone page except Login, Venue selection, Welcome, and Terms must use one.
 */
export type MobileTabBarApp = "profile" | "notifications" | "revenue";

const HOME_TAB: MobileTabItem = {
  id: MOBILE_HOME_TAB_ID,
  label: "Home",
  icon: House,
  pageId: "welcome",
  path: "/welcome",
};

/**
 * Four app-specific tabs. Combined with Home this is always 5 icons.
 * Add a new key when another operational app gets a phone shell.
 */
const APP_TABS: Record<
  MobileTabBarApp,
  readonly [MobileTabItem, MobileTabItem, MobileTabItem, MobileTabItem]
> = {
  profile: [
    {
      id: "profile",
      label: "Profile",
      icon: UserRound,
      pageId: "employee-profile",
      path: "/employee-profile",
    },
    {
      id: "attendance",
      label: "Attendance",
      icon: CalendarCheck,
      path: "/attendance",
    },
    {
      id: "leave",
      label: "Leave",
      icon: CalendarOff,
      path: "/leave",
    },
    {
      id: "payslips",
      label: "Payslips",
      icon: ReceiptText,
      path: "/payslips",
    },
  ],
  notifications: [
    {
      id: "inbox",
      label: "Inbox",
      icon: Bell,
      pageId: "notifications",
      path: "/notifications",
    },
    {
      id: "alerts",
      label: "Alerts",
      icon: OctagonAlert,
      path: "/notifications/alerts",
    },
    {
      id: "archive",
      label: "Archive",
      icon: Archive,
      path: "/notifications/archive",
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      path: "/notifications/settings",
    },
  ],
  revenue: [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
      pageId: "revenue",
      path: "/revenue",
    },
    {
      id: "daily",
      label: "Daily",
      icon: Coins,
      path: "/revenue/daily",
    },
    {
      id: "waiters",
      label: "Waiters",
      icon: UserRound,
      path: "/revenue/waiters",
    },
    {
      id: "reports",
      label: "Reports",
      icon: FileBarChart,
      path: "/revenue/reports",
    },
  ],
};

export function tabBarItems(app: MobileTabBarApp): MobileTabItem[] {
  return [HOME_TAB, ...APP_TABS[app]];
}

export function tabBarHref(venueSlug: string, path: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}${path}`;
}
