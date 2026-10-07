"use client";

import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { COS_CENTRE_SECTIONS } from "@/lib/sales/cos-centre-sections";
import type { CostCentre } from "@/lib/sales/cos-types";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

export function CosCentreSubNav({ centre }: { centre: CostCentre }) {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Cost centre sections" className={pillSubNavShellClass}>
      {COS_CENTRE_SECTIONS.map((section) => {
        const href = `/gp-cos/${centre}/${section.key}`;
        return (
          <SubNavTab
            key={section.key}
            href={href}
            label={section.label}
            icon={section.icon}
            active={pathname.startsWith(href)}
            variant="pill"
          />
        );
      })}
    </nav>
  );
}
