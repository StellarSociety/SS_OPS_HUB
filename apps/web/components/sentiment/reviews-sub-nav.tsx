"use client";

import { ClipboardPen, LayoutGrid } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  GoogleMark,
  TripAdvisorMark,
} from "@/components/sentiment/channel-marks";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { reviewPeriodQueryFromSearch } from "@/lib/sentiment/review-period";
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
  {
    href: "/sentiment/reviews/guest",
    label: "Feedback Form",
    icon: ClipboardPen,
    exact: false,
  },
] as const;

export function ReviewsSubNav() {
  const pathname = useRelativePathname();
  const searchParams = useSearchParams();
  const query = reviewPeriodQueryFromSearch(searchParams);
  const suffix = query ? `?${query}` : "";

  return (
    <nav aria-label="Review channels" className={pillSubNavShellClass}>
      {tabs.map((tab) => (
        <SubNavTab
          key={tab.href}
          href={`${tab.href}${suffix}`}
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
