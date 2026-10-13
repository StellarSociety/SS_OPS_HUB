"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { canUseConnect } from "@/lib/connect/access";
import { getChatMembership } from "@/lib/connect/chat-store";
import {
  isChatReactionKey,
  type ChatReactionKey,
  type ChatReactionRow,
} from "@/lib/connect/chat-reactions";
import { createServiceClient } from "@/lib/supabase/service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type Member = { userId: string; service: ReturnType<typeof createServiceClient> };

async function requireMember(conversationId: string): Promise<Member | { error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error ?? "Not signed in." };
  if (auth.venue.is_global) return { error: "Open Chats from a venue." };
  if (!(await canUseConnect(auth))) {
    return { error: "You don't have access to Connecteam." };
  }
  const service = createServiceClient();
  const membership = await getChatMembership(service, conversationId, auth.user.id);
  if (!membership) return { error: "Chat not found." };
  return { userId: auth.user.id, service };
}

/** Every reaction in a chat, for the open conversation. */
export async function fetchChatReactions(
  conversationId: string,
): Promise<Result<{ rows: ChatReactionRow[] }>> {
  const actor = await requireMember(conversationId);
  if ("error" in actor) return { ok: false, error: actor.error };
  const { data, error } = await actor.service
    .from("chat_message_reactions")
    .select("message_id, conversation_id, user_id, reaction, created_at")
    .eq("conversation_id", conversationId);
  if (error) {
    // Before the migration runs, chats simply show no reactions.
    if (/chat_message_reactions/.test(error.message)) return { ok: true, rows: [] };
    return { ok: false, error: error.message };
  }
  return { ok: true, rows: (data ?? []) as ChatReactionRow[] };
}

/** Sets the viewer's reaction on a message, or clears it with `null`. */
export async function setChatReaction(
  messageId: string,
  reaction: ChatReactionKey | null,
): Promise<Result> {
  if (reaction !== null && !isChatReactionKey(reaction)) return { ok: false, error: "Unknown reaction." };
  const service = createServiceClient();
  const { data: message } = await service
    .from("chat_messages")
    .select("id, conversation_id, kind, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!message || message.kind !== "message" || message.deleted_at) {
    return { ok: false, error: "This message can't be reacted to." };
  }
  const conversationId = message.conversation_id as string;
  const actor = await requireMember(conversationId);
  if ("error" in actor) return { ok: false, error: actor.error };

  const { error } =
    reaction === null
      ? await actor.service
          .from("chat_message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", actor.userId)
      : await actor.service.from("chat_message_reactions").upsert(
          {
            message_id: messageId,
            conversation_id: conversationId,
            user_id: actor.userId,
            reaction,
            created_at: new Date().toISOString(),
          },
          { onConflict: "message_id,user_id" },
        );
  if (error) {
    return {
      ok: false,
      error: /chat_message_reactions/.test(error.message)
        ? "Reactions need the latest database update."
        : error.message,
    };
  }
  return { ok: true };
}
