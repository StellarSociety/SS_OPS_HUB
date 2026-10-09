import { ChatConversation } from "@/components/connect/chat/chat-conversation";
import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { getChatDetail, listChatMessages } from "@/lib/connect/chat-store";
import { listVenueAppUsers } from "@/lib/connect/store";
import { getMobileConnectContext } from "@/lib/mobile/connect-context";
import { mobileConnectHref } from "@/lib/mobile/app-path";
import { VenueProvider } from "@/components/providers/venue-provider";

export default async function MobileConnectConversationPage({
  params,
}: {
  params: Promise<{ venueSlug: string; conversationId: string }>;
}) {
  const { venueSlug, conversationId } = await params;
  const { service, venue, user, me, canAccess } = await getMobileConnectContext(venueSlug);
  if (!canAccess) return <MobileAccessDenied />;
  const detail = await getChatDetail(service, venue.id, conversationId, user.id);
  if (!detail) {
    return <div className="flex h-full items-center justify-center px-8 text-center text-sm text-black/50">This chat is no longer available.</div>;
  }
  const [{ messages, hasMore }, people] = await Promise.all([
    listChatMessages(service, conversationId),
    listVenueAppUsers(service, venue.id),
  ]);

  return (
    <VenueProvider initialVenue={venue}>
      <div className="mobile-app-canvas h-full min-h-0 bg-white">
        <ChatConversation
          detail={detail}
          initialMessages={messages}
          initialHasMore={hasMore}
          me={me}
          venuePeople={people}
          backHref={mobileConnectHref(venue.slug)}
        />
      </div>
    </VenueProvider>
  );
}
