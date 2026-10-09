import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileConnectFeed } from "@/components/mobile/mobile-connect-feed";
import { listConnectPosts } from "@/lib/connect/store";
import { getMobileConnectContext } from "@/lib/mobile/connect-context";

export default async function MobileConnectGroupFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ venueSlug: string; groupId: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { venueSlug, groupId } = await params;
  const query = await searchParams;
  const { service, venue, user, me, groups, canAccess } = await getMobileConnectContext(venueSlug);
  if (!canAccess) return <MobileAccessDenied />;
  const visibleGroups = groups.filter((group) => group.myRole !== null);
  const selectedGroup = visibleGroups.find((group) => group.id === groupId) ?? null;
  if (!selectedGroup) {
    return <div className="flex h-full items-center justify-center px-8 text-center text-sm text-black/50">This group feed is no longer available.</div>;
  }
  const { posts, nextBefore } = await listConnectPosts(service, {
    venueId: venue.id,
    groups: [selectedGroup],
    viewerId: user.id,
    before: query.before ?? null,
    pinnedFirst: true,
  });

  return <MobileConnectFeed venue={venue} me={me} groups={visibleGroups} selectedGroup={selectedGroup} posts={posts} nextBefore={nextBefore} />;
}
