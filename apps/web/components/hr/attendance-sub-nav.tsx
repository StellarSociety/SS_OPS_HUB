"use client";

import { CalendarCheck, ClipboardCheck, LineChart } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const TABS = [
  {
    href: "/hr/attendance",
    label: "Records",
    icon: CalendarCheck,
    exact: true,
  },
  {
    href: "/hr/attendance/insights",
    label: "Insights",
    icon: LineChart,
    exact: true,
  },
  {
    href: "/hr/attendance/approvals",
    label: "Approvals",
    icon: ClipboardCheck,
    exact: true,
  },
] as const;

export function AttendanceSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Attendance sections"
      className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
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
