"use client";

import { AlertTriangle, BadgeCheck, GitCompareArrows } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/sales/daily-vs-waiters/figures-verification",
    label: "Daily vs Waiters",
    icon: BadgeCheck,
    exact: false,
  },
  {
    href: "/sales/daily-vs-waiters",
    label: "Monthly vs Waiters",
    icon: GitCompareArrows,
    exact: true,
  },
  {
    href: "/sales/daily-vs-waiters/figures-alerts",
    label: "Figures Alerts",
    icon: AlertTriangle,
    exact: false,
  },
] as const;

export function DailyVsWaitersSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Daily vs Waiters sections"
      className={segmentedSubNavShellClass}
    >
      {tabs.map((tab) => (
        <SubNavTab
          key={tab.href}
          href={tab.href}
          label={tab.label}
          icon={tab.icon}
          active={
            tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          }
        />
      ))}
    </nav>
  );
}
