"use client";

import { HandCoins, Percent, PiggyBank } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import {
  HR_BENEFITS_COLLECTIONS_HREF,
  HR_BENEFITS_GRATUITY_HREF,
  HR_BENEFITS_SERVICE_CHARGE_HREF,
} from "@/lib/hr/settings-nav";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const TABS = [
  {
    href: HR_BENEFITS_GRATUITY_HREF,
    label: "Gratuity",
    icon: HandCoins,
  },
  {
    href: HR_BENEFITS_COLLECTIONS_HREF,
    label: "Collections",
    icon: PiggyBank,
  },
  {
    href: HR_BENEFITS_SERVICE_CHARGE_HREF,
    label: "Service Charge",
    icon: Percent,
  },
] as const;

export function BenefitsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Benefits sections" className={pillSubNavShellClass}>
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
