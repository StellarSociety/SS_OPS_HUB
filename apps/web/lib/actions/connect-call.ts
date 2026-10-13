"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { getChatConversation, getChatMembership } from "@/lib/connect/chat-store";
import {
  isOpenChatCall,
  mapChatCallRow,
  type ChatCall,
  type ChatCallMode,
  type ChatCallRow,
  type ChatCallStatus,
} from "@/lib/connect/chat-call-types";
import { loadConnectPeople } from "@/lib/connect/store";
import type { VenueSoundDefaults } from "@/lib/connect/sounds";
import { loadVenueSoundDefaults } from "@/lib/connect/venue-sound-defaults";
import { CONNECT_MODULE_KEY } from "@/lib/connect/types";
import { dispatchPendingPushes } from "@/lib/push/send";
import { createServiceClient } from "@/lib/supabase/service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type CallActor = {
  userId: string;
  venueId: string;
  service: ReturnType<typeof createServiceClient>;
};

const CALL_SELECT = "*";
const RING_SECONDS = 45;
const TERMINAL_STATUSES: ChatCallStatus[] = ["ended", "declined", "missed", "cancelled"];

function fail(message: string) {
  return { ok: false as const, error: message };
}

function liveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL?.trim() &&
      process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim(),
  );
}

async function requireActor(): Promise<CallActor | { error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };
  if (auth.venue.is_global) return { error: "Open the chat from a venue to make a call." };
  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

async function callForActor(actor: CallActor, callId: string): Promise<ChatCallRow | null> {
  const { data } = await actor.service
    .from("chat_calls")
    .select(CALL_SELECT)
    .eq("id", callId)
    .eq("venue_id", actor.venueId)
    .maybeSingle();
  const row = data as ChatCallRow | null;
  if (!row) return null;
  const membership = await getChatMembership(actor.service, row.conversation_id, actor.userId);
  return membership ? row : null;
}

async function namesFor(
  actor: CallActor,
  userIds: string[],
): Promise<Map<string, string>> {
  const people = await loadConnectPeople(actor.service, userIds);
  return new Map([...people.entries()].map(([id, person]) => [id, person.name]));
}

async function notifyIncomingCall(
  actor: CallActor,
  call: ChatCallRow,
  recipientIds: string[],
) {
  if (recipientIds.length === 0) return;
  const names = await namesFor(actor, [actor.userId]);
  const caller = names.get(actor.userId) ?? "Someone";
  const label = call.mode === "video" ? "video" : "voice";
  const now = new Date().toISOString();
  const { error } = await actor.service.from("notifications").upsert(
    recipientIds.map((userId) => ({
      user_id: userId,
      venue_id: actor.venueId,
      module_key: CONNECT_MODULE_KEY,
      type: "chat_call_incoming",
      title: `Incoming ${label} call from ${caller}`,
      body: "Tap to open the call in Ops Hub.",
      entity: "chat_conversation",
      entity_id: call.conversation_id,
      severity: "critical",
      dedupe_key: `chat-call:${call.id}:${userId}`,
      read_at: null,
      archived_at: null,
      push_sent_at: null,
      created_at: now,
    })),
    { onConflict: "dedupe_key" },
  );
  if (error) {
    console.error("[chat-call] notification failed:", error.message);
    return;
  }
  await dispatchPendingPushes(actor.service);
}

async function closeCallNotification(actor: CallActor, callId: string) {
  const now = new Date().toISOString();
  await actor.service
    .from("notifications")
    .update({ read_at: now, archived_at: now })
    .like("dedupe_key", `chat-call:${callId}:%`)
    .is("archived_at", null);
}

function durationLabel(from: string | null, to: string): string {
  if (!from) return "";
  const total = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function addCallHistoryMessage(actor: CallActor, call: ChatCallRow) {
  const label = call.mode === "video" ? "Video" : "Voice";
  const body =
    call.status === "missed"
      ? `Missed ${label.toLowerCase()} call`
      : call.status === "declined"
        ? `Declined ${label.toLowerCase()} call`
        : call.status === "cancelled"
          ? `Cancelled ${label.toLowerCase()} call`
          : `${label} call · ${durationLabel(call.answered_at, call.ended_at ?? new Date().toISOString())}`;
  const { data, error } = await actor.service
    .from("chat_messages")
    .insert({
      conversation_id: call.conversation_id,
      venue_id: call.venue_id,
      sender_id: call.initiated_by,
      body,
      kind: "system",
    })
    .select("created_at")
    .single();
  if (error) {
    console.error("[chat-call] history message failed:", error.message);
    return;
  }
  await actor.service
    .from("chat_conversations")
    .update({ last_message_at: data.created_at })
    .eq("id", call.conversation_id);
}

async function transitionCall(
  actor: CallActor,
  row: ChatCallRow,
  status: Extract<ChatCallStatus, "ended" | "declined" | "missed" | "cancelled">,
): Promise<ChatCallRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await actor.service
    .from("chat_calls")
    .update({ status, ended_at: now })
    .eq("id", row.id)
    .in("status", ["ringing", "active"])
    .select(CALL_SELECT)
    .maybeSingle();
  if (error) throw error;
  const updated = data as ChatCallRow | null;
  if (!updated) return null;

  const participantStatus = status === "declined" ? "declined" : status === "missed" ? "missed" : "left";
  await Promise.all([
    actor.service
      .from("chat_call_participants")
      .update({ status: participantStatus, left_at: now })
      .eq("call_id", row.id)
      .neq("status", "left"),
    closeCallNotification(actor, row.id),
  ]);
  await addCallHistoryMessage(actor, updated);
  return updated;
}

export async function fetchOpenChatCall(
  conversationId: string,
): Promise<Result<{ call: ChatCall | null }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return fail("Chat not found.");
  const { data, error } = await actor.service
    .from("chat_calls")
    .select(CALL_SELECT)
    .eq("conversation_id", conversationId)
    .in("status", ["ringing", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/chat_calls/.test(error.message)) return fail("Calls need the latest database migration.");
    return fail(error.message);
  }
  const row = data as ChatCallRow | null;
  if (!row) return { ok: true, call: null };
  if (row.status === "ringing" && new Date(row.expires_at).getTime() <= Date.now()) {
    const updated = await transitionCall(actor, row, "missed");
    return { ok: true, call: updated ? mapChatCallRow(updated) : null };
  }
  return { ok: true, call: mapChatCallRow(row) };
}

export type ChatCallPeer = { name: string; photoUrl: string | null };

/** The other person on a 1:1 call, as seen by the viewer. */
async function peerFor(actor: CallActor, row: ChatCallRow): Promise<ChatCallPeer> {
  const { data: members } = await actor.service
    .from("chat_members")
    .select("user_id")
    .eq("conversation_id", row.conversation_id)
    .neq("user_id", actor.userId)
    .limit(1);
  const otherId = (members?.[0] as { user_id: string } | undefined)?.user_id;
  if (!otherId) return { name: "Ops Hub user", photoUrl: null };
  const person = (await loadConnectPeople(actor.service, [otherId])).get(otherId);
  return { name: person?.name ?? "Ops Hub user", photoUrl: person?.photoUrl ?? null };
}

/**
 * The viewer's open call anywhere in the venue, for the app-wide call
 * listener. Also returns who the viewer is, so the client can subscribe.
 */
export async function fetchMyCallState(): Promise<
  Result<{
    meId: string;
    venueId: string;
    soundDefaults: VenueSoundDefaults | null;
    call: ChatCall | null;
    peer: ChatCallPeer | null;
  }>
> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const base = {
    meId: actor.userId,
    venueId: actor.venueId,
    soundDefaults: await loadVenueSoundDefaults(actor.service, actor.venueId),
  };
  const { data: mine } = await actor.service
    .from("chat_call_participants")
    .select("call_id")
    .eq("user_id", actor.userId)
    .in("status", ["invited", "joined"])
    .order("created_at", { ascending: false })
    .limit(5);
  const callIds = ((mine ?? []) as { call_id: string }[]).map((r) => r.call_id);
  if (callIds.length === 0) return { ok: true, ...base, call: null, peer: null };
  const { data } = await actor.service
    .from("chat_calls")
    .select(CALL_SELECT)
    .in("id", callIds)
    .eq("venue_id", actor.venueId)
    .in("status", ["ringing", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as ChatCallRow | null;
  if (!row) return { ok: true, ...base, call: null, peer: null };
  if (row.status === "ringing" && new Date(row.expires_at).getTime() <= Date.now()) {
    await transitionCall(actor, row, "missed");
    return { ok: true, ...base, call: null, peer: null };
  }
  return { ok: true, ...base, call: mapChatCallRow(row), peer: await peerFor(actor, row) };
}

export async function fetchChatCallPeer(callId: string): Promise<Result<{ peer: ChatCallPeer }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const row = await callForActor(actor, callId);
  if (!row) return fail("Call not found.");
  return { ok: true, peer: await peerFor(actor, row) };
}

export async function startChatCall(
  conversationId: string,
  mode: ChatCallMode,
): Promise<Result<{ call: ChatCall }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  if (!liveKitConfigured()) {
    return fail(
      process.env.NODE_ENV === "development"
        ? "Calling isn't set up on this computer. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to apps/web/.env.local, then restart the dev server."
        : "Calling isn't configured yet. Add the LiveKit URL, API key and secret in Vercel.",
    );
  }
  if (mode !== "audio" && mode !== "video") return fail("Choose a valid call type.");

  const conv = await getChatConversation(actor.service, actor.venueId, conversationId);
  if (!conv || conv.kind !== "direct") return fail("The trial currently supports 1:1 chats only.");
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return fail("Chat not found.");

  const { data: members } = await actor.service
    .from("chat_members")
    .select("user_id")
    .eq("conversation_id", conversationId);
  const memberIds = ((members ?? []) as { user_id: string }[]).map((row) => row.user_id);
  const recipients = memberIds.filter((id) => id !== actor.userId);
  if (recipients.length !== 1) return fail("This 1:1 chat doesn't have an available recipient.");

  const { data: existing } = await actor.service
    .from("chat_calls")
    .select(CALL_SELECT)
    .eq("conversation_id", conversationId)
    .in("status", ["ringing", "active"])
    .maybeSingle();
  if (existing) return fail("There is already a call in this chat.");

  const id = randomUUID();
  const now = Date.now();
  const { data, error } = await actor.service
    .from("chat_calls")
    .insert({
      id,
      conversation_id: conversationId,
      venue_id: actor.venueId,
      initiated_by: actor.userId,
      mode,
      status: "ringing",
      livekit_room: `chat-call-${id}`,
      expires_at: new Date(now + RING_SECONDS * 1000).toISOString(),
    })
    .select(CALL_SELECT)
    .single();
  if (error) {
    if (/chat_calls/.test(error.message)) return fail("Calls need the latest database migration.");
    if (error.code === "23505") return fail("There is already a call in this chat.");
    return fail(error.message);
  }
  const row = data as ChatCallRow;
  const { error: participantsError } = await actor.service.from("chat_call_participants").insert(
    memberIds.map((userId) => ({
      call_id: id,
      user_id: userId,
      status: userId === actor.userId ? "joined" : "invited",
      joined_at: userId === actor.userId ? new Date(now).toISOString() : null,
    })),
  );
  if (participantsError) {
    await actor.service.from("chat_calls").delete().eq("id", id);
    return fail(participantsError.message);
  }

  after(() => notifyIncomingCall(actor, row, recipients));
  return { ok: true, call: mapChatCallRow(row) };
}

export async function acceptChatCall(callId: string): Promise<Result<{ call: ChatCall }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const row = await callForActor(actor, callId);
  if (!row) return fail("Call not found.");
  if (row.initiated_by === actor.userId) return fail("The caller can't accept their own call.");
  if (row.status !== "ringing") return fail("This call is no longer ringing.");
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await transitionCall(actor, row, "missed");
    return fail("This call was missed.");
  }

  const now = new Date().toISOString();
  const { data, error } = await actor.service
    .from("chat_calls")
    .update({ status: "active", answered_at: now })
    .eq("id", callId)
    .eq("status", "ringing")
    .select(CALL_SELECT)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("This call is no longer available.");
  await Promise.all([
    actor.service
      .from("chat_call_participants")
      .update({ status: "joined", joined_at: now })
      .eq("call_id", callId)
      .eq("user_id", actor.userId),
    closeCallNotification(actor, callId),
  ]);
  return { ok: true, call: mapChatCallRow(data as ChatCallRow) };
}

export async function declineChatCall(callId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const row = await callForActor(actor, callId);
  if (!row || row.status !== "ringing") return fail("This call is no longer ringing.");
  if (row.initiated_by === actor.userId) return fail("Use cancel for an outgoing call.");
  await transitionCall(actor, row, "declined");
  return { ok: true };
}

export async function cancelChatCall(callId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const row = await callForActor(actor, callId);
  if (!row || row.status !== "ringing") return fail("This call is no longer ringing.");
  if (row.initiated_by !== actor.userId) return fail("Only the caller can cancel this call.");
  await transitionCall(actor, row, "cancelled");
  return { ok: true };
}

export async function expireChatCall(callId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const row = await callForActor(actor, callId);
  if (!row || row.status !== "ringing") return { ok: true };
  if (new Date(row.expires_at).getTime() > Date.now()) return fail("This call is still ringing.");
  await transitionCall(actor, row, "missed");
  return { ok: true };
}

export async function endChatCall(callId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const row = await callForActor(actor, callId);
  if (!row) return fail("Call not found.");
  if (TERMINAL_STATUSES.includes(row.status)) return { ok: true };
  if (!isOpenChatCall(row.status)) return fail("This call is no longer active.");
  const status = row.status === "ringing" ? (row.initiated_by === actor.userId ? "cancelled" : "declined") : "ended";
  await transitionCall(actor, row, status);
  return { ok: true };
}
