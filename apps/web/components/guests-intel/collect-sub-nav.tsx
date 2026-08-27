"use client";

import { QrCode, Smartphone } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/guests-intel/collect",
    label: "Simulator",
    icon: Smartphone,
    exact: true,
  },
  {
    href: "/guests-intel/collect/share",
    label: "Share with guests",
    icon: QrCode,
    exact: false,
  },
] as const;

export function CollectSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Collect" className={pillSubNavShellClass}>
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
