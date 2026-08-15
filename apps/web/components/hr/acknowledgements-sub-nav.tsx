"use client";

import { List, Users } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

export const ACKNOWLEDGEMENTS_ALL_HREF =
  "/hr/communications/acknowledgements";
export const ACKNOWLEDGEMENTS_EMPLOYEES_HREF =
  "/hr/communications/acknowledgements/employees";

const TABS = [
  {
    href: ACKNOWLEDGEMENTS_ALL_HREF,
    label: "All Records",
    icon: List,
    exact: true,
  },
  {
    href: ACKNOWLEDGEMENTS_EMPLOYEES_HREF,
    label: "Employee Records",
    icon: Users,
    exact: false,
  },
] as const;

export function AcknowledgementsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Acknowledgement views"
      className={pillSubNavShellClass}
    >
      {TABS.map((tab) => {
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
            variant="pill"
          />
        );
      })}
    </nav>
  );
}
