import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileConnectFeed } from "@/components/mobile/mobile-connect-feed";
import { listConnectPosts } from "@/lib/connect/store";
import { getMobileConnectContext } from "@/lib/mobile/connect-context";

/** My threads: posts the viewer wrote or commented on, newest first. */
export default async function MobileConnectThreadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ venueSlug: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { venueSlug } = await params;
  const query = await searchParams;
  const { service, venue, user, me, groups, canAccess } = await getMobileConnectContext(venueSlug);
  if (!canAccess) return <MobileAccessDenied />;
  const visibleGroups = groups.filter((group) => group.myRole !== null);
  const { posts, nextBefore } = await listConnectPosts(service, {
    venueId: venue.id,
    groups: visibleGroups,
    viewerId: user.id,
    before: query.before ?? null,
    involvingUserId: user.id,
  });

  return (
    <MobileConnectFeed
      tab="threads"
      venue={venue}
      me={me}
      groups={visibleGroups}
      selectedGroup={null}
      posts={posts}
      nextBefore={nextBefore}
    />
  );
}
