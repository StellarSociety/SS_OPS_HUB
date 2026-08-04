"use client";

import { ClipboardList, Users } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const TABS = [
  {
    href: "/hr/assets/uniform/employees",
    label: "Employees",
    icon: Users,
  },
  {
    href: "/hr/assets/uniform/details",
    label: "Uniform details",
    icon: ClipboardList,
  },
] as const;

export function UniformSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Uniform sections" className={pillSubNavShellClass}>
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
