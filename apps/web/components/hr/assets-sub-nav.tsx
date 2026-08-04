"use client";

import { Package, Shirt } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const TABS = [
  {
    href: "/hr/assets",
    label: "Assets",
    icon: Package,
    exact: true,
  },
  {
    href: "/hr/assets/uniform",
    label: "Uniform",
    icon: Shirt,
    exact: false,
  },
] as const;

export function AssetsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Assets sections" className={pillSubNavShellClass}>
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
