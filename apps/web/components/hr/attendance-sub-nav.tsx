"use client";

import {
  CalendarCheck,
  ClipboardCheck,
  LineChart,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const TABS = [
  {
    href: "/hr/attendance/validation",
    label: "Validation",
    icon: ClipboardCheck,
    exact: true,
  },
  {
    href: "/hr/attendance/insights",
    label: "Insights",
    icon: LineChart,
    exact: true,
  },
  {
    href: "/hr/attendance/records",
    label: "Records",
    icon: CalendarCheck,
    exact: true,
  },
] as const;

export function AttendanceSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Attendance sections"
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
