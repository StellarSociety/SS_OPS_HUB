"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { listMyChats } from "@/lib/connect/chat-store";
import type { ChatSummary } from "@/lib/connect/chat-types";
import { canAccessConnect } from "@/lib/connect/permissions";
import { listVenueAppUsers } from "@/lib/connect/store";
import type { ConnectPerson } from "@/lib/connect/types";
import { loadPresence, type PresenceStatus } from "@/lib/connect/presence";
import { createServiceClient } from "@/lib/supabase/service";

export type ChatWidgetData = {
  meId: string;
  chats: ChatSummary[];
  /** Everyone at the venue the viewer can message (excluding themselves). */
  people: ConnectPerson[];
  /** Online status per user (direct-chat partners and people). */
  presence: Record<string, PresenceStatus>;
};

/** Conversations and people for the floating chat widget. */
export async function getChatWidgetData(): Promise<
  { ok: true; data: ChatWidgetData } | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (auth.venue.is_global) return { ok: false, error: "Open a venue to chat." };
  if (!canAccessConnect(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "No access to Connecteam." };
  }
  const service = createServiceClient();
  const [chats, people] = await Promise.all([
    listMyChats(service, auth.venue.id, auth.user.id),
    listVenueAppUsers(service, auth.venue.id),
  ]);
  const others = people.filter((p) => p.userId !== auth.user.id);
  const presence = await loadPresence(service, [
    ...others.map((p) => p.userId),
    ...chats.map((c) => c.otherUserId ?? ""),
  ]);
  return {
    ok: true,
    data: {
      meId: auth.user.id,
      chats,
      people: others,
      presence,
    },
  };
}

/** Lightweight refresh of everyone's online status for the widget. */
export async function getChatPresence(): Promise<
  { ok: true; presence: Record<string, PresenceStatus> } | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (auth.venue.is_global || !canAccessConnect(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "No access to Connecteam." };
  }
  const service = createServiceClient();
  const people = await listVenueAppUsers(service, auth.venue.id);
  const presence = await loadPresence(
    service,
    people.map((p) => p.userId).filter((id) => id !== auth.user.id),
  );
  return { ok: true, presence };
}
