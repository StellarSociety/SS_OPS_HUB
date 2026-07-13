"use client";

import {
  Database,
  LayoutGrid,
  Percent,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  { href: "/sales/settings", label: "Overview", icon: LayoutGrid, exact: true as const },
  { href: "/sales/settings/tax", label: "Sales Tax", icon: Percent, exact: false as const },
  { href: "/sales/settings/waiters", label: "Waiters", icon: Users, exact: false as const },
  { href: "/sales/settings/tenders", label: "Tenders", icon: Wallet, exact: false as const },
  {
    href: "/sales/settings/groups-charge",
    label: "Groups charge",
    icon: UserCog,
    exact: false as const,
  },
  {
    href: "/sales/settings/data-management",
    label: "Data Management",
    icon: Database,
    exact: false as const,
  },
] as const;

export function SalesSettingsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Sales settings sections"
      className={segmentedSubNavShellClass}
    >
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
