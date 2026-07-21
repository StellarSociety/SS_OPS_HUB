"use client";

import {
  Bell,
  CalendarCheck,
  Database,
  UserPlus,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import {
  HR_SETTINGS_ATTENDANCE_HREF,
  HR_SETTINGS_BOARDING_HREF,
  HR_SETTINGS_DATA_MANAGEMENT_HREF,
  HR_SETTINGS_NOTIFICATIONS_HREF,
  HR_SETTINGS_PAY_HREF,
  HR_SETTINGS_STAFF_DETAILS_HREF,
} from "@/lib/hr/settings-nav";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const TOP_TABS: Tab[] = [
  {
    href: HR_SETTINGS_STAFF_DETAILS_HREF,
    label: "Staff Details",
    icon: UserRound,
  },
  {
    href: HR_SETTINGS_ATTENDANCE_HREF,
    label: "Attendance",
    icon: CalendarCheck,
  },
  { href: HR_SETTINGS_PAY_HREF, label: "Pay", icon: Wallet },
  { href: HR_SETTINGS_BOARDING_HREF, label: "Boarding", icon: UserPlus },
  {
    href: HR_SETTINGS_NOTIFICATIONS_HREF,
    label: "Notifications",
    icon: Bell,
  },
  {
    href: HR_SETTINGS_DATA_MANAGEMENT_HREF,
    label: "Data Management",
    icon: Database,
  },
];

export function HrSettingsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Human Resources settings sections"
      className={segmentedSubNavShellClass}
    >
      {TOP_TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <SubNavTab
            key={tab.href}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={active}
          />
        );
      })}
    </nav>
  );
}
