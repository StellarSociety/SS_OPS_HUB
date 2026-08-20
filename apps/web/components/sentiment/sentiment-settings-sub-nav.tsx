"use client";

import { Link2, MessageSquareText } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/sentiment/settings",
    label: "Connections",
    icon: Link2,
    exact: true,
  },
  {
    href: "/sentiment/settings/templates",
    label: "Reply templates",
    icon: MessageSquareText,
    exact: false,
  },
] as const;

export function SentimentSettingsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Sentiment settings sections"
      className={segmentedSubNavShellClass}
    >
      {tabs.map((tab) => (
        <SubNavTab
          key={tab.href}
          href={tab.href}
          label={tab.label}
          icon={tab.icon}
          active={
            tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          }
        />
      ))}
    </nav>
  );
}
