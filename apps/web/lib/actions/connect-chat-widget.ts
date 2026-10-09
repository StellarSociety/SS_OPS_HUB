"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { listMyChats } from "@/lib/connect/chat-store";
import type { ChatSummary } from "@/lib/connect/chat-types";
import { canAccessConnect } from "@/lib/connect/permissions";
import { listVenueAppUsers } from "@/lib/connect/store";
import type { ConnectPerson } from "@/lib/connect/types";
import { createServiceClient } from "@/lib/supabase/service";

export type ChatWidgetData = {
  meId: string;
  chats: ChatSummary[];
  /** Everyone at the venue the viewer can message (excluding themselves). */
  people: ConnectPerson[];
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
  return {
    ok: true,
    data: {
      meId: auth.user.id,
      chats,
      people: people.filter((p) => p.userId !== auth.user.id),
    },
  };
}
