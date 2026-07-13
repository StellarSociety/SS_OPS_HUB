"use client";

import { BarChart3, Percent, UserCheck } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const DEFAULT_BASE_PATH = "/sales/settings/data-management";

function tabsForBase(basePath: string) {
  return [
    { href: `${basePath}/daily-sales`, label: "Daily Sales", icon: BarChart3 },
    { href: `${basePath}/waiter-sales`, label: "Waiter Sales", icon: UserCheck },
    { href: `${basePath}/discounts`, label: "Discounts", icon: Percent },
  ] as const;
}

type Props = {
  basePath?: string;
};

export function DataManagementSubNav({ basePath = DEFAULT_BASE_PATH }: Props) {
  const pathname = useRelativePathname();
  const tabs = tabsForBase(basePath);

  return (
    <nav
      aria-label="Data management sections"
      className="flex flex-wrap gap-2 border-b border-black/10 pb-3"
    >
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);

        return (
          <SubNavTab
            key={tab.href}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={active}
            variant="pill"
          />
        );
      })}
    </nav>
  );
}
