"use client";

import { ApifyMark, GoogleMark, TripAdvisorMark } from "@/components/sentiment/channel-marks";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/sentiment/settings/apify",
    label: "Apify",
    icon: ApifyMark,
  },
  {
    href: "/sentiment/settings/google",
    label: "Google",
    icon: GoogleMark,
  },
  {
    href: "/sentiment/settings/tripadvisor",
    label: "Tripadvisor",
    icon: TripAdvisorMark,
  },
] as const;

export function ConnectionsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Review connections" className={pillSubNavShellClass}>
      {tabs.map((tab) => (
        <SubNavTab
          key={tab.href}
          href={tab.href}
          label={tab.label}
          icon={tab.icon}
          active={pathname.startsWith(tab.href)}
          variant="pill"
        />
      ))}
    </nav>
  );
}
