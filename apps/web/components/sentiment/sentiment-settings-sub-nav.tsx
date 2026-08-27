"use client";

import { Link2, MessageSquareText } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

function isConnectionsPath(pathname: string) {
  if (pathname.startsWith("/sentiment/settings/templates")) return false;
  return (
    pathname === "/sentiment/settings" ||
    pathname.startsWith("/sentiment/settings/apify") ||
    pathname.startsWith("/sentiment/settings/google") ||
    pathname.startsWith("/sentiment/settings/tripadvisor")
  );
}

const tabs = [
  {
    href: "/sentiment/settings/apify",
    label: "Connections",
    icon: Link2,
    isActive: isConnectionsPath,
  },
  {
    href: "/sentiment/settings/templates",
    label: "Reply templates",
    icon: MessageSquareText,
    isActive: (pathname: string) =>
      pathname.startsWith("/sentiment/settings/templates"),
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
          active={tab.isActive(pathname)}
        />
      ))}
    </nav>
  );
}
