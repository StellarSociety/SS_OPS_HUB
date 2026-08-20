"use client";

import { LayoutGrid } from "lucide-react";
import { GoogleMark, TripAdvisorMark } from "@/components/sentiment/channel-marks";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/sentiment/reviews",
    label: "All reviews",
    icon: LayoutGrid,
    exact: true,
  },
  {
    href: "/sentiment/reviews/google",
    label: "Google",
    icon: GoogleMark,
    exact: false,
  },
  {
    href: "/sentiment/reviews/tripadvisor",
    label: "TripAdvisor",
    icon: TripAdvisorMark,
    exact: false,
  },
] as const;

export function ReviewsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Review channels" className={pillSubNavShellClass}>
      {tabs.map((tab) => (
        <SubNavTab
          key={tab.href}
          href={tab.href}
          label={tab.label}
          icon={tab.icon}
          active={
            tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          }
          variant="pill"
        />
      ))}
    </nav>
  );
}
