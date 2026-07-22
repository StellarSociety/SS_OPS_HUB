"use client";

import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { salesSectionTabs } from "@/lib/sales-section-sub-nav";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = salesSectionTabs("/sales/waiter");

export function WaiterSalesSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Waiter Sales sections"
      className={pillSubNavShellClass}
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
            variant="pill"
          />
        );
      })}
    </nav>
  );
}
