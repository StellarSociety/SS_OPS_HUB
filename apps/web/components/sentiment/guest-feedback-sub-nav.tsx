"use client";

import { ClipboardPen, Globe, Megaphone, Share2, Smartphone } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/sentiment/guest-feedback",
    label: "Share page",
    icon: Share2,
    exact: true,
  },
  {
    href: "/sentiment/guest-feedback/questionnaire",
    label: "Questionnaire",
    icon: ClipboardPen,
    exact: false,
  },
  {
    href: "/sentiment/guest-feedback/simulator",
    label: "Simulator",
    icon: Smartphone,
    exact: false,
  },
  {
    href: "/sentiment/guest-feedback/promotions",
    label: "Promotions",
    icon: Megaphone,
    exact: false,
  },
  {
    href: "/sentiment/guest-feedback/socials",
    label: "Social pages",
    icon: Globe,
    exact: false,
  },
] as const;

export function GuestFeedbackSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav aria-label="Guest Feedback" className={pillSubNavShellClass}>
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
