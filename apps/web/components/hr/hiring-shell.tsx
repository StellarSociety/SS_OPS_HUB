"use client";

import { CalendarDays, ClipboardList, FileStack, Star } from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";

const TABS = [
  {
    href: "/hr/hiring/forms",
    label: "Forms Builder",
    shortLabel: "Forms",
    icon: FileStack,
  },
  {
    href: "/hr/hiring/replies",
    label: "Candidate Replies",
    shortLabel: "Replies",
    icon: ClipboardList,
  },
  {
    href: "/hr/hiring/shortlist",
    label: "Shortlisted Candidates",
    shortLabel: "Shortlist",
    icon: Star,
  },
  {
    href: "/hr/hiring/calendar",
    label: "Appointments Calendar",
    shortLabel: "Calendar",
    icon: CalendarDays,
  },
] as const;

export function HiringShell({
  venueSubtitle,
  children,
}: {
  venueSubtitle: string;
  children: React.ReactNode;
}) {
  const pathname = useRelativePathname();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <ModulePageTitle>Hiring</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{venueSubtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>
      <nav
        aria-label="Hiring sections"
        className="flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-black/10 bg-white/50 p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <SubNavTab
              key={tab.href}
              href={tab.href}
              label={tab.label}
              shortLabel={tab.shortLabel}
              icon={tab.icon}
              active={active}
              variant="pill"
              className="min-h-11 shrink-0 sm:min-h-0"
            />
          );
        })}
      </nav>
      {children}
    </div>
  );
}
