import Link from "next/link";
import { Newspaper } from "lucide-react";
import { ConnectSeenMarker } from "@/components/connect/connect-seen-marker";
import { FeedList } from "@/components/connect/feed-list";
import { GroupBadge } from "@/components/connect/group-icon";
import { PostComposer } from "@/components/connect/post-composer";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { roleCanPost } from "@/lib/connect/permissions";
import type { ConnectGroup, ConnectPerson, ConnectPost } from "@/lib/connect/types";
import { mobileConnectFeedHref } from "@/lib/mobile/app-path";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";

export function MobileConnectFeed({
  venue,
  me,
  groups,
  selectedGroup,
  posts,
  nextBefore,
  onSelectTab,
}: {
  venue: Venue;
  me: ConnectPerson | null;
  groups: ConnectGroup[];
  selectedGroup: ConnectGroup | null;
  posts: ConnectPost[];
  nextBefore: string | null;
  onSelectTab?: (tab: MobileTabItem) => void;
}) {
  const feedGroups = selectedGroup ? [selectedGroup] : groups.filter((group) => group.myRole !== null);
  const postable = feedGroups.filter((group) => roleCanPost(group.myRole));
  const defaultGroup = selectedGroup ?? postable[0] ?? null;
  const basePath = mobileConnectFeedHref(venue.slug, selectedGroup?.id);

  return (
    <div className="mobile-app-canvas relative flex h-full min-h-0 flex-col bg-[#F7F8F2]">
      <header className="flex shrink-0 items-center gap-3 border-b border-black/10 bg-white px-4 pb-3 pt-4">
        {selectedGroup ? (
          <GroupBadge icon={selectedGroup.icon} color={selectedGroup.color} className="h-10 w-10 rounded-full" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white"><Newspaper className="h-5 w-5" /></span>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-serif text-xl font-semibold text-[#3D421F]">{selectedGroup?.name ?? `${venue.name} Feed`}</h1>
          <p className="truncate text-xs text-black/45">{selectedGroup ? `${selectedGroup.memberCount} members` : `${feedGroups.length} group feeds`}</p>
        </div>
      </header>

      {!selectedGroup && groups.length > 0 ? (
        <nav className="shrink-0 border-b border-black/5 bg-white px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-black/40">Group feeds</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {groups.map((group) => (
              <Link key={group.id} href={mobileConnectFeedHref(venue.slug, group.id)} className="w-16 shrink-0 text-center">
                <GroupBadge icon={group.icon} color={group.color} className="mx-auto h-11 w-11 rounded-full" />
                <span className="mt-1 block truncate text-[11px] text-[#2B2F16]">{group.name}</span>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-3">
        <ConnectSeenMarker groupId={selectedGroup?.id ?? null} />
        {postable.length > 0 ? (
          <div className="mb-3">
            <PostComposer
              me={me}
              groups={postable.map((group) => ({ id: group.id, name: group.name, color: group.color }))}
              defaultGroupId={defaultGroup?.id ?? null}
              basePath={basePath}
            />
          </div>
        ) : null}
        <FeedList
          posts={posts}
          me={me}
          showGroup={!selectedGroup}
          nextBefore={nextBefore}
          basePath={basePath}
          emptyMessage="Nothing has been posted here yet."
          groupBasePath={mobileConnectFeedHref(venue.slug)}
        />
      </main>
      <MobileTabBar app="connect" activeId="feed" venueSlug={venue.slug} onSelectTab={onSelectTab} />
    </div>
  );
}
