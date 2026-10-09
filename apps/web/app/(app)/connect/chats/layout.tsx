import { ChatShell } from "@/components/connect/chat/chat-shell";
import { canCreateChatGroups } from "@/lib/connect/chat-permissions";
import { listMyChats } from "@/lib/connect/chat-store";
import { getConnectPageContext } from "@/lib/connect/page-context";
import { loadPresence } from "@/lib/connect/presence";
import { listVenueAppUsers } from "@/lib/connect/store";
import { getVenueBadgeUrl } from "@/lib/venue/branding";

export default async function ConnectChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { service, venue, user, groups, isConnectAdmin, seesAllGroups } =
    await getConnectPageContext();
  const [chats, people] = await Promise.all([
    listMyChats(service, venue.id, user.id),
    listVenueAppUsers(service, venue.id),
  ]);
  const presence = await loadPresence(
    service,
    people.map((p) => p.userId).filter((id) => id !== user.id),
  );

  return (
    <ChatShell
      chats={chats}
      meId={user.id}
      people={people}
      canCreateGroups={canCreateChatGroups(groups, isConnectAdmin)}
      venueName={venue.name}
      venueBadgeUrl={getVenueBadgeUrl(venue)}
      feedGroups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        color: g.color,
        memberCount: g.memberCount,
      }))}
      canManageGroups={seesAllGroups}
      presence={presence}
    >
      {children}
    </ChatShell>
  );
}
