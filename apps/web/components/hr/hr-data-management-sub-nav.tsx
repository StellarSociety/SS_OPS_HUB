"use client";

import { CalendarCheck, Users } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const DEFAULT_BASE_PATH = "/hr/settings/data-management";

function tabsForBase(basePath: string) {
  return [
    {
      href: `${basePath}/employees-details`,
      label: "Employees Details",
      icon: Users,
    },
    {
      href: `${basePath}/attendance`,
      label: "Attendance",
      icon: CalendarCheck,
    },
  ] as const;
}

type Props = {
  basePath?: string;
};

export function HrDataManagementSubNav({ basePath = DEFAULT_BASE_PATH }: Props) {
  const pathname = useRelativePathname();
  const tabs = tabsForBase(basePath);

  return (
    <nav
      aria-label="HR data management sections"
      className="flex flex-wrap gap-2 border-b border-black/10 pb-3"
    >
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);

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
