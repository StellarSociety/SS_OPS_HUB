"use client";

import { UserPlus, Users } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const tabs = [
  { href: "/settings/users", label: "Current users", icon: Users },
  { href: "/settings/users/invite", label: "Invite user", icon: UserPlus },
] as const;

export function UsersSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Users & access sections"
      className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
    >
      {tabs.map((tab) => {
        const active =
          tab.href === "/settings/users"
            ? pathname === "/settings/users"
            : pathname.startsWith(tab.href);
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
