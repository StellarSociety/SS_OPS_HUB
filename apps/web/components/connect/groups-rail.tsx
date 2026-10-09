"use client";

import { Newspaper, Settings } from "lucide-react";
import { GroupBadge } from "@/components/connect/group-icon";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import type { ConnectGroup } from "@/lib/connect/types";
import { cn } from "@/lib/utils";

/** Facebook-style left rail: home feed + the viewer's groups. */
export function GroupsRail({
  groups,
  canOpenSettings,
}: {
  groups: ConnectGroup[];
  canOpenSettings: boolean;
}) {
  const pathname = useRelativePathname();
  const row =
    "flex items-center gap-3 rounded-xl px-2 py-2 text-[15px] font-medium text-[#2B2F16] hover:bg-black/5";

  return (
    <nav aria-label="Connecteam groups" className="space-y-1">
      <ScopedLink
        href="/connect"
        className={cn(row, pathname === "/connect" && "bg-[#E9ECD9]")}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--venue-primary,#818a40)] text-white">
          <Newspaper className="h-5 w-5" aria-hidden />
        </span>
        Feed
      </ScopedLink>

      <p className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-black/45">
        Your groups
      </p>
      {groups.length === 0 ? (
        <p className="px-2 text-sm text-black/50">
          You haven&apos;t been added to a group yet.
        </p>
      ) : (
        groups.map((g) => {
          const href = `/connect/groups/${g.id}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <ScopedLink key={g.id} href={href} className={cn(row, active && "bg-[#E9ECD9]")}>
              <GroupBadge icon={g.icon} color={g.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{g.name}</span>
                <span className="block text-xs font-normal text-black/50">
                  {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                </span>
              </span>
            </ScopedLink>
          );
        })
      )}

      {canOpenSettings ? (
        <ScopedLink href="/connect/settings" className={cn(row, "mt-3 text-black/60")}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-black/5">
            <Settings className="h-5 w-5" aria-hidden />
          </span>
          Manage groups
        </ScopedLink>
      ) : null}
    </nav>
  );
}
