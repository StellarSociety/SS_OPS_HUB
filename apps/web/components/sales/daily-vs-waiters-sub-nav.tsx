"use client";

import { BadgeCheck, GitCompareArrows } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/sales/daily-vs-waiters",
    label: "Daily vs Waiters",
    icon: GitCompareArrows,
    exact: true,
  },
  {
    href: "/sales/daily-vs-waiters/figures-verification",
    label: "Figures Verification",
    icon: BadgeCheck,
    exact: false,
  },
];

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
