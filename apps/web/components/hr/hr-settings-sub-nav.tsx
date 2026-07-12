"use client";

import { Bell, CalendarClock, LayoutGrid, ListChecks, Wallet } from "lucide-react";
import { usePathname } from "next/navigation";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  { href: "/hr/settings", label: "Overview", icon: LayoutGrid, exact: true as const },
  {
    href: "/hr/settings/lookups",
    label: "Lookups",
    icon: ListChecks,
    exact: false as const,
  },
  {
    href: "/hr/settings/expiry",
    label: "Expiry & Reminders",
    icon: CalendarClock,
    exact: false as const,
  },
  {
    href: "/hr/settings/salary",
    label: "Salary Defaults",
    icon: Wallet,
    exact: false as const,
  },
  {
    href: "/hr/settings/notifications",
    label: "Notifications",
    icon: Bell,
    exact: false as const,
  },
] as const;

export function HrSettingsSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Human Resources settings sections" className={segmentedSubNavShellClass}>
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);

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
