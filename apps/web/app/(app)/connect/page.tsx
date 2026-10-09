import { CelebrationsCard } from "@/components/connect/celebrations-card";
import { ConnectFrame } from "@/components/connect/connect-frame";
import { ConnectSeenMarker } from "@/components/connect/connect-seen-marker";
import { FeedList } from "@/components/connect/feed-list";
import { PostComposer } from "@/components/connect/post-composer";
import { composerCelebrationFromParams } from "@/lib/connect/composer-celebration";
import {
  getConnectPageContext,
  loadConnectCelebrations,
} from "@/lib/connect/page-context";
import { roleCanPost } from "@/lib/connect/permissions";
import { listConnectPosts } from "@/lib/connect/store";

export default async function ConnectFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; celebrate?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const { service, venue, user, me, groups, seesAllGroups } =
    await getConnectPageContext();

  // The home feed shows the viewer's own groups; settings viewers who are not
  // members still reach other groups from the rail.
  const feedGroups = groups.filter((g) => g.myRole !== null);
  const postable = feedGroups.filter((g) => roleCanPost(g.myRole));
  // Default the composer to the whole-team group (everyone can post there).
  const teamGroup = postable.find((g) => g.autoMemberRole === "contributor");

  const [{ posts, nextBefore }, celebrations] = await Promise.all([
    listConnectPosts(service, {
      venueId: venue.id,
      groups: feedGroups,
      viewerId: user.id,
      before: params.before ?? null,
    }),
    loadConnectCelebrations(service, venue),
  ]);

  const celebration = composerCelebrationFromParams(params, celebrations);

  return (
    <ConnectFrame
      groups={groups}
      canOpenSettings={seesAllGroups}
      right={
        <CelebrationsCard items={celebrations} basePath="/connect" canPost={postable.length > 0} />
      }
    >
      <ConnectSeenMarker />
      {params.before ? null : (
        <PostComposer
          me={me}
          groups={postable.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
          defaultGroupId={teamGroup?.id ?? null}
          celebration={celebration}
          basePath="/connect"
        />
      )}
      <FeedList
        posts={posts}
        me={me}
        showGroup
        nextBefore={nextBefore}
        basePath="/connect"
        emptyMessage={
          feedGroups.length === 0
            ? "You're not in any group yet. Ask a manager to add you to your team's groups."
            : "No posts yet. Be the first to share something with the team!"
        }
      />
    </ConnectFrame>
  );
}
