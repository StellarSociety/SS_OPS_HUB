"use client";

import { Share2, Tablet } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/sentiment/live-display",
    label: "Tablet view",
    icon: Tablet,
    exact: true,
  },
  {
    href: "/sentiment/live-display/share",
    label: "Sharable link",
    icon: Share2,
    exact: false,
  },
] as const;

export function LiveDisplaySubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Live Display" className={pillSubNavShellClass}>
      {tabs.map((tab) => (
        <SubNavTab
          key={tab.href}
          href={tab.href}
          label={tab.label}
          icon={tab.icon}
          active={
            tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          }
          variant="pill"
        />
      ))}
    </nav>
  );
}
