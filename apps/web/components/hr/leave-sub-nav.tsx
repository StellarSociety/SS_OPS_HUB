"use client";

import { CalendarDays, ClipboardList, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const TABS = [
  {
    href: "/hr/attendance/leave/balances",
    label: "Balances",
    icon: Wallet,
  },
  {
    href: "/hr/attendance/leave/requests",
    label: "Requests",
    icon: ClipboardList,
  },
  {
    href: "/hr/attendance/leave/calendar",
    label: "Calendar",
    icon: CalendarDays,
  },
] as const;

export function LeaveSubNav() {
  const pathname = useRelativePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <nav
      aria-label="Leave sections"
      className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <SubNavTab
            key={tab.href}
            href={`${tab.href}${suffix}`}
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
