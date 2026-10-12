import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileConnectScreen } from "@/components/mobile/mobile-connect-screen";
import { canCreateChatGroups } from "@/lib/connect/chat-permissions";
import { listMyChats } from "@/lib/connect/chat-store";
import { listVenueAppUsers } from "@/lib/connect/store";
import { getMobileConnectContext } from "@/lib/mobile/connect-context";

export default async function MobileConnectPage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const { service, venue, user, groups, isConnectAdmin, canAccess } =
    await getMobileConnectContext(venueSlug);
  if (!canAccess) return <MobileAccessDenied />;
  const [chats, people] = await Promise.all([
    listMyChats(service, venue.id, user.id),
    listVenueAppUsers(service, venue.id),
  ]);

  return (
    <MobileConnectScreen
      venue={venue}
      chats={chats}
      groups={groups.filter((group) => group.myRole !== null)}
      meId={user.id}
      people={people}
      canCreateGroups={canCreateChatGroups(groups, isConnectAdmin)}
    />
  );
}
