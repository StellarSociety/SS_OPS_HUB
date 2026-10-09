import { ArrowLeft, Newspaper, Settings } from "lucide-react";
import { CelebrationsCard } from "@/components/connect/celebrations-card";
import { ConnectSeenMarker } from "@/components/connect/connect-seen-marker";
import { FeedList } from "@/components/connect/feed-list";
import { FeedSearch } from "@/components/connect/feed-search";
import { GroupBadge } from "@/components/connect/group-icon";
import { PostComposer } from "@/components/connect/post-composer";
import { ScopedLink } from "@/components/layout/scoped-link";
import { composerCelebrationFromParams } from "@/lib/connect/composer-celebration";
import {
  getConnectPageContext,
  loadConnectCelebrations,
} from "@/lib/connect/page-context";
import { roleCanManageGroup, roleCanPost } from "@/lib/connect/permissions";
import { listConnectPosts } from "@/lib/connect/store";
import { CONNECT_GROUP_ROLE_LABELS } from "@/lib/connect/types";

export type FeedPaneParams = { before?: string; celebrate?: string; kind?: string; q?: string };

/**
 * The feed inside the Connecteam messenger pane: every group's posts, or one
 * group's posts when `groupId` is set.
 */
export async function FeedPane({
  groupId = null,
  params,
}: {
  groupId?: string | null;
  params: FeedPaneParams;
}) {
  const { service, venue, user, me, groups } = await getConnectPageContext();

  const group = groupId ? (groups.find((g) => g.id === groupId) ?? null) : null;
  if (groupId && !group) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#F7F8F2] p-8 text-center text-sm text-black/55">
        This group isn&apos;t available — you may not be a member.
      </div>
    );
  }

  const feedGroups = group ? [group] : groups.filter((g) => g.myRole !== null);
  const postable = feedGroups.filter((g) => roleCanPost(g.myRole));
  const defaultGroup = group ?? postable.find((g) => g.autoMemberRole === "contributor") ?? null;
  const basePath = group ? `/connect/chats/feed/${group.id}` : "/connect/chats/feed";
  const searchQuery = params.q?.trim() ?? "";

  const [{ posts, nextBefore }, celebrations] = await Promise.all([
    listConnectPosts(service, {
      venueId: venue.id,
      groups: feedGroups,
      viewerId: user.id,
      before: params.before ?? null,
      pinnedFirst: Boolean(group),
      search: searchQuery || null,
    }),
    postable.length > 0 ? loadConnectCelebrations(service, venue) : Promise.resolve([]),
  ]);
  const celebration = composerCelebrationFromParams(params, celebrations);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/60 bg-[#fbfaf6] px-4">
        <ScopedLink
          href="/connect/chats"
          className="rounded-full p-1.5 text-black/55 hover:bg-black/5 md:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </ScopedLink>
        {group ? (
          <GroupBadge icon={group.icon} color={group.color} className="h-11 w-11 rounded-full" />
        ) : (
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white">
            <Newspaper className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-[#2B2F16]">
            {group ? group.name : `${venue.name} Feed`}
          </h2>
          <p className="truncate text-xs text-black/50">
            {group
              ? [
                  `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`,
                  group.myRole ? `You: ${CONNECT_GROUP_ROLE_LABELS[group.myRole]}` : null,
                  group.description || null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : `Posts from ${feedGroups.length} group${feedGroups.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <FeedSearch key={basePath} basePath={basePath} initialQuery={searchQuery} />
        {group && roleCanManageGroup(group.myRole) ? (
          <ScopedLink
            href={`/connect/groups/${group.id}/settings`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--venue-secondary,#F0F3DD)] px-3 py-2 text-sm font-medium text-[#3D421F] hover:opacity-90"
          >
            <Settings className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Group settings</span>
          </ScopedLink>
        ) : null}
      </header>

      {/* The divider from the list starts below the shared top bar. */}
      <div className="min-h-0 flex-1 overflow-y-auto border-l border-white/70">
        <div className="mx-auto grid max-w-[1040px] gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-4">
            <ConnectSeenMarker groupId={group?.id ?? null} />
            {searchQuery ? (
              <p className="rounded-xl bg-white/80 px-4 py-2.5 text-sm text-black/60 shadow-sm">
                {posts.length === 0
                  ? `No posts match “${searchQuery}”.`
                  : `${posts.length}${nextBefore ? "+" : ""} post${posts.length === 1 && !nextBefore ? "" : "s"} matching “${searchQuery}”`}
              </p>
            ) : null}
            {params.before || searchQuery || postable.length === 0 ? null : (
              <PostComposer
                me={me}
                groups={postable.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
                defaultGroupId={defaultGroup?.id ?? null}
                celebration={celebration}
                basePath={basePath}
              />
            )}
            <FeedList
              posts={posts}
              me={me}
              showGroup={!group}
              nextBefore={nextBefore}
              basePath={searchQuery ? `${basePath}?q=${encodeURIComponent(searchQuery)}` : basePath}
              emptyMessage={
                searchQuery
                  ? "Try another word, or clear the search to see every post."
                  : feedGroups.length === 0
                  ? "You're not in any group yet. Ask a manager to add you to your team's groups."
                  : postable.length > 0
                    ? "No posts yet. Be the first to share something with the team!"
                    : "Nothing has been posted here yet."
              }
            />
          </div>
          {postable.length > 0 ? (
            <aside className="hidden xl:block">
              <div className="sticky top-0">
                <CelebrationsCard items={celebrations} basePath={basePath} canPost />
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
