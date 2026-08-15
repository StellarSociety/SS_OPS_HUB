"use client";

import { BadgeCheck } from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const TABS = [
  {
    href: "/hr/communications/acknowledgements",
    label: "Acknowledgements",
    icon: BadgeCheck,
  },
] as const;

export function CommunicationsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useRelativePathname();

  return (
    <div className="space-y-6">
      <div>
        <ModulePageTitle>Communications</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Track employee acknowledgements for emails that require confirmation.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <nav aria-label="Communications sections" className={pillSubNavShellClass}>
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
      {children}
    </div>
  );
}
