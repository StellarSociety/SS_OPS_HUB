"use client";

import { ClipboardList, Users } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/hr/assets/catalog/employees",
    label: "Employees",
    icon: Users,
  },
  {
    href: "/hr/assets/catalog/details",
    label: "Asset details",
    icon: ClipboardList,
  },
] as const;

export function AssetsCatalogSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Assets sections"
      className={cn(pillSubNavShellClass, "w-full justify-center")}
    >
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
