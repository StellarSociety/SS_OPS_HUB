"use client";

import type { ReactNode } from "react";
import { FileCheck, ScrollText } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

export const POLICIES_HREF = "/hr/communications/policies";
export const POLICIES_HUB_TERMS_HREF = "/hr/communications/policies/hub-terms";

export function PoliciesSection({ children }: { children: ReactNode }) {
  const pathname = useRelativePathname();
  const onHubTerms =
    pathname === POLICIES_HUB_TERMS_HREF ||
    pathname.startsWith(`${POLICIES_HUB_TERMS_HREF}/`);

  const tabs = [
    { href: POLICIES_HREF, label: "Policies", icon: ScrollText, active: !onHubTerms },
    {
      href: POLICIES_HUB_TERMS_HREF,
      label: "SS OPS HUB T&C's",
      icon: FileCheck,
      active: onHubTerms,
    },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <nav aria-label="Policy views" className={`${pillSubNavShellClass} shrink-0`}>
        {tabs.map((tab) => (
          <SubNavTab
            key={tab.href}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={tab.active}
            variant="pill"
          />
        ))}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
