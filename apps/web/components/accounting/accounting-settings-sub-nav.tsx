"use client";

import {
  BookOpen,
  Building2,
  Hash,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/accounting/settings",
    label: "Entities",
    icon: Building2,
    exact: true as const,
  },
  {
    href: "/accounting/settings/coa",
    label: "Chart of Accounts",
    icon: BookOpen,
    exact: false as const,
  },
  {
    href: "/accounting/settings/dimensions",
    label: "Dimensions",
    icon: Layers,
    exact: false as const,
  },
  {
    href: "/accounting/settings/defaults",
    label: "Defaults",
    icon: SlidersHorizontal,
    exact: false as const,
  },
  {
    href: "/accounting/settings/sequences",
    label: "Sequences",
    icon: Hash,
    exact: false as const,
  },
] as const;

export function AccountingSettingsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Accounting settings sections"
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
