"use client";

import type { ReactNode } from "react";
import { FileCheck, List, Users } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

export const ACKNOWLEDGEMENTS_ALL_HREF =
  "/hr/communications/acknowledgements";
export const ACKNOWLEDGEMENTS_EMPLOYEES_HREF =
  "/hr/communications/acknowledgements/employees";
export const ACKNOWLEDGEMENTS_HUB_TERMS_HREF =
  "/hr/communications/acknowledgements/hub-terms";

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
  {
    href: ACKNOWLEDGEMENTS_HUB_TERMS_HREF,
    label: "SS OPS HUB T&C's",
    icon: FileCheck,
    exact: false,
  },
] as const;

export function AcknowledgementsSection({
  reminder,
  children,
}: {
  reminder: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRelativePathname();
  const isHubTerms =
    pathname === ACKNOWLEDGEMENTS_HUB_TERMS_HREF ||
    pathname.startsWith(`${ACKNOWLEDGEMENTS_HUB_TERMS_HREF}/`);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <AcknowledgementsSubNav />
      </div>
      {isHubTerms ? null : <div className="shrink-0">{reminder}</div>}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

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
