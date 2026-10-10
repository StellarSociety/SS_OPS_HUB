import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileConnectFeed } from "@/components/mobile/mobile-connect-feed";
import { listConnectPosts } from "@/lib/connect/store";
import { isAnnouncementsGroup } from "@/lib/connect/types";
import { getMobileConnectContext } from "@/lib/mobile/connect-context";

export default async function MobileConnectAnnouncementsPage({
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
  const announcements = visibleGroups.find(isAnnouncementsGroup) ?? null;
  if (!announcements) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-black/50">
        This venue has no Announcements group yet.
      </div>
    );
  }
  const { posts, nextBefore } = await listConnectPosts(service, {
    venueId: venue.id,
    groups: [announcements],
    viewerId: user.id,
    before: query.before ?? null,
    pinnedFirst: true,
  });

  return (
    <MobileConnectFeed
      tab="announcements"
      venue={venue}
      me={me}
      groups={visibleGroups}
      selectedGroup={announcements}
      posts={posts}
      nextBefore={nextBefore}
    />
  );
}
