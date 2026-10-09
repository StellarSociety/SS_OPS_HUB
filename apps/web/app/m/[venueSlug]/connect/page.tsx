import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileConnectScreen } from "@/components/mobile/mobile-connect-screen";
import { listMyChats } from "@/lib/connect/chat-store";
import { getMobileConnectContext } from "@/lib/mobile/connect-context";

export default async function MobileConnectPage({
  params,
}: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const { service, venue, user, groups, canAccess } = await getMobileConnectContext(venueSlug);
  if (!canAccess) return <MobileAccessDenied />;
  const chats = await listMyChats(service, venue.id, user.id);

  return (
    <MobileConnectScreen
      venue={venue}
      chats={chats}
      groups={groups.filter((group) => group.myRole !== null)}
      meId={user.id}
    />
  );
}
