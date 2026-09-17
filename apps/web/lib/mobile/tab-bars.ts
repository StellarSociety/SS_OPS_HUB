import {
  Archive,
  Bell,
  Cake,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CircleDashed,
  ClipboardList,
  Coins,
  FileBarChart,
  FolderOpen,
  House,
  LayoutDashboard,
  MessageSquare,
  Network,
  OctagonAlert,
  Settings,
  UserRound,
  Users,
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
 * Apps that own a 5-icon bar. Home is appended on the right and is never listed here.
 * Every phone page except Login, Venue selection, Welcome, and Terms must use one.
 */
export type MobileTabBarApp =
  | "profile"
  | "notifications"
  | "revenue"
  | "sentiment"
  | "directory";

const HOME_TAB: MobileTabItem = {
  id: MOBILE_HOME_TAB_ID,
  label: "Home",
  icon: House,
  pageId: "welcome",
  path: "/welcome",
};

/**
 * Four app-specific tabs. Combined with Home (last / right) this is always 5 icons.
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
      pageId: "attendance",
      path: "/attendance",
    },
    {
      id: "leave",
      label: "Leave",
      icon: CalendarOff,
      pageId: "leave",
      path: "/leave",
    },
    {
      id: "docs",
      label: "Docs",
      icon: FolderOpen,
      pageId: "docs",
      path: "/docs",
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
      pageId: "notification-alerts",
      path: "/notifications/alerts",
    },
    {
      id: "archive",
      label: "Archive",
      icon: Archive,
      pageId: "notification-archive",
      path: "/notifications/archive",
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      pageId: "notification-settings",
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
  sentiment: [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      pageId: "sentiment",
      path: "/sentiment",
    },
    {
      id: "reviews",
      label: "Reviews",
      icon: MessageSquare,
      pageId: "sentiment-reviews",
      path: "/sentiment/reviews",
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: CalendarDays,
      pageId: "sentiment-calendar",
      path: "/sentiment/calendar",
    },
    {
      id: "actions",
      label: "Actions",
      icon: ClipboardList,
      pageId: "sentiment-actions",
      path: "/sentiment/actions",
    },
  ],
  directory: [
    {
      id: "staff",
      label: "Staff",
      icon: Users,
      pageId: "directory",
      path: "/directory",
    },
    {
      id: "celebrations",
      label: "Celebrations",
      icon: Cake,
      pageId: "directory-celebrations",
      path: "/directory/celebrations",
    },
    {
      id: "hierarchy",
      label: "Hierarchy",
      icon: Network,
      pageId: "directory-hierarchy",
      path: "/directory/hierarchy",
    },
    {
      id: "reserved",
      label: " ",
      icon: CircleDashed,
      path: "/directory/reserved",
    },
  ],
};

export function tabBarItems(app: MobileTabBarApp): MobileTabItem[] {
  return [...APP_TABS[app], HOME_TAB];
}

export function tabBarHref(venueSlug: string, path: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}${path}`;
}
