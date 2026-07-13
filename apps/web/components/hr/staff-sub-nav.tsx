"use client";

import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { BarChart3, Table2, UserPlus, type LucideIcon } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

type StaffTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
};

const tabs: StaffTab[] = [
  { href: "/hr/staff", label: "Insights", icon: BarChart3, exact: true },
  { href: "/hr/staff/entry", label: "Entry Form", icon: UserPlus, exact: false },
  { href: "/hr/staff/data", label: "Database Table", icon: Table2, exact: false },
];

export function StaffSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Staff directory sections" className={segmentedSubNavShellClass}>
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
