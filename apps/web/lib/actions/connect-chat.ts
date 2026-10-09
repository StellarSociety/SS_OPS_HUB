"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  directKey,
  getChatConversation,
  getChatDetail,
  getChatMembership,
  listChatMessages,
  listChatShared,
} from "@/lib/connect/chat-store";
import {
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_NOTIFICATION_ENTITY,
  mapChatMessageRow,
  type ChatDetail,
  type ChatMessage,
  type ChatMessageRow,
  type ChatRole,
  type ChatShared,
} from "@/lib/connect/chat-types";
import { canAccessConnect, canAdminConnect } from "@/lib/connect/permissions";
import { canCreateChatGroups } from "@/lib/connect/chat-permissions";
import { listConnectGroups, listVenueAppUsers, loadConnectPeople } from "@/lib/connect/store";
import {
  type ConnectPerson,
  CONNECT_BUCKET,
  CONNECT_MAX_FILE_BYTES,
  CONNECT_MODULE_KEY,
} from "@/lib/connect/types";
import { dispatchPendingPushes } from "@/lib/push/send";
import {
  asUploadBlob,
  convertImageToWebp,
  shouldSkipWebpConversion,
  uploadBlobMeta,
} from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(message: string) {
  return { ok: false as const, error: message };
}

type ChatActor = {
  userId: string;
  venueId: string;
  isConnectAdmin: boolean;
  service: ReturnType<typeof createServiceClient>;
};

const MESSAGE_SELECT =
  "id, conversation_id, sender_id, body, kind, attachment_url, attachment_name, attachment_type, attachment_size, created_at, edited_at, deleted_at";

function revalidateChats() {
  revalidatePath("/connect/chats", "layout");
}

async function requireActor(): Promise<ChatActor | { error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };
  if (auth.venue.is_global) return { error: "Open Chats from a venue." };
  if (!canAccessConnect(auth.permissions, auth.venue.id)) {
    return { error: "You don't have access to Connecteam." };
  }
  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    isConnectAdmin: canAdminConnect(auth.permissions, auth.venue.id),
    service: createServiceClient(),
  };
}

async function venueAudienceIds(actor: ChatActor): Promise<Set<string>> {
  const people = await listVenueAppUsers(actor.service, actor.venueId);
  return new Set(people.map((p) => p.userId));
}

async function addSystemMessage(actor: ChatActor, conversationId: string, body: string) {
  await actor.service.from("chat_messages").insert({
    conversation_id: conversationId,
    venue_id: actor.venueId,
    sender_id: actor.userId,
    body,
    kind: "system",
  });
}

async function nameOf(actor: ChatActor, userId: string): Promise<string> {
  const people = await loadConnectPeople(actor.service, [userId]);
  return people.get(userId)?.name ?? "Someone";
}

function cleanColor(color: string | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#818a40";
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** Open (or create) the 1:1 chat with another person at this venue. */
export async function startDirectChat(otherUserId: string): Promise<Result<{ id: string }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  if (!otherUserId || otherUserId === actor.userId) return fail("Choose someone to message.");

  const audience = await venueAudienceIds(actor);
  if (!audience.has(otherUserId)) return fail("That person isn't on the Hub at this venue.");

  const key = directKey(actor.userId, otherUserId);
  const { data: existing } = await actor.service
    .from("chat_conversations")
    .select("id")
    .eq("venue_id", actor.venueId)
    .eq("direct_key", key)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };

  const id = randomUUID();
  const { error } = await actor.service.from("chat_conversations").insert({
    id,
    venue_id: actor.venueId,
    kind: "direct",
    direct_key: key,
    created_by: actor.userId,
  });
  if (error) {
    // Lost a race with the other person opening the same chat.
    if (error.code === "23505") {
      const { data: again } = await actor.service
        .from("chat_conversations")
        .select("id")
        .eq("venue_id", actor.venueId)
        .eq("direct_key", key)
        .maybeSingle();
      if (again) return { ok: true, id: again.id as string };
    }
    return fail(error.message);
  }

  const { error: memberError } = await actor.service.from("chat_members").insert(
    [actor.userId, otherUserId].map((userId) => ({
      conversation_id: id,
      user_id: userId,
      venue_id: actor.venueId,
      role: "member",
      added_by: actor.userId,
    })),
  );
  if (memberError) {
    await actor.service.from("chat_conversations").delete().eq("id", id);
    return fail(memberError.message);
  }

  revalidateChats();
  return { ok: true, id };
}

export type GroupChatInput = {
  name: string;
  description?: string;
  color?: string;
  memberIds?: string[];
  onlyAdminsCanPost?: boolean;
  membersCanAdd?: boolean;
};

export async function createGroupChat(input: GroupChatInput): Promise<Result<{ id: string }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const groups = await listConnectGroups(actor.service, actor.venueId, {
    userId: actor.userId,
    seesAllGroups: false,
    isConnectAdmin: actor.isConnectAdmin,
  });
  if (!canCreateChatGroups(groups, actor.isConnectAdmin)) {
    return fail("Only admins and moderators can create group chats.");
  }

  const name = input.name.trim().slice(0, 60);
  if (!name) return fail("Give the group chat a name.");

  const audience = await venueAudienceIds(actor);
  const memberIds = [...new Set((input.memberIds ?? []).filter((id) => audience.has(id)))].filter(
    (id) => id !== actor.userId,
  );

  const id = randomUUID();
  const { error } = await actor.service.from("chat_conversations").insert({
    id,
    venue_id: actor.venueId,
    kind: "group",
    name,
    description: (input.description ?? "").trim().slice(0, 300),
    color: cleanColor(input.color),
    only_admins_can_post: Boolean(input.onlyAdminsCanPost),
    members_can_add: Boolean(input.membersCanAdd),
    created_by: actor.userId,
  });
  if (error) return fail(error.message);

  const { error: memberError } = await actor.service.from("chat_members").insert([
    { conversation_id: id, user_id: actor.userId, venue_id: actor.venueId, role: "admin", added_by: actor.userId },
    ...memberIds.map((userId) => ({
      conversation_id: id,
      user_id: userId,
      venue_id: actor.venueId,
      role: "member",
      added_by: actor.userId,
    })),
  ]);
  if (memberError) {
    await actor.service.from("chat_conversations").delete().eq("id", id);
    return fail(memberError.message);
  }

  await addSystemMessage(actor, id, `${await nameOf(actor, actor.userId)} created “${name}”.`);
  await writeAuditLog({
    actor_id: actor.userId,
    action: "connect.chat.group.create",
    module_key: CONNECT_MODULE_KEY,
    entity: "chat_conversations",
    entity_id: id,
    venue_id: actor.venueId,
    after: { name, members: memberIds.length + 1 },
  });

  revalidateChats();
  return { ok: true, id };
}

/** Chat admins edit name, description, colour and access options. */
export async function updateGroupChat(
  conversationId: string,
  input: GroupChatInput,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const conv = await getChatConversation(actor.service, actor.venueId, conversationId);
  if (!conv || conv.kind !== "group") return fail("Group chat not found.");
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (membership?.role !== "admin") return fail("Only chat admins can change this chat.");

  const name = input.name.trim().slice(0, 60);
  if (!name) return fail("Give the group chat a name.");

  const { error } = await actor.service
    .from("chat_conversations")
    .update({
      name,
      description: (input.description ?? "").trim().slice(0, 300),
      color: cleanColor(input.color),
      only_admins_can_post: Boolean(input.onlyAdminsCanPost),
      members_can_add: Boolean(input.membersCanAdd),
    })
    .eq("id", conversationId);
  if (error) return fail(error.message);

  if (name !== conv.name) {
    await addSystemMessage(actor, conversationId, `${await nameOf(actor, actor.userId)} renamed the chat to “${name}”.`);
  }

  revalidateChats();
  return { ok: true };
}

/** Add people, change their chat role, or remove them (`role: null`). */
export async function setGroupChatMembers(
  conversationId: string,
  userIds: string[],
  role: ChatRole | null,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const conv = await getChatConversation(actor.service, actor.venueId, conversationId);
  if (!conv || conv.kind !== "group") return fail("Group chat not found.");
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return fail("You're not in this chat.");
  const isAdmin = membership.role === "admin";

  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };

  const { data: currentRows } = await actor.service
    .from("chat_members")
    .select("user_id, role")
    .eq("conversation_id", conversationId);
  const current = new Map(
    ((currentRows ?? []) as { user_id: string; role: ChatRole }[]).map((r) => [r.user_id, r.role]),
  );
  const adding = ids.filter((id) => !current.has(id));
  const changing = ids.filter((id) => current.has(id));

  if (role === null || changing.length > 0 || role === "admin") {
    if (!isAdmin) return fail("Only chat admins can change roles or remove people.");
  } else if (!isAdmin && !conv.members_can_add) {
    return fail("Only chat admins can add people to this chat.");
  }

  if (role === null) {
    const remaining = [...current.entries()].filter(([id]) => !ids.includes(id));
    if (!remaining.some(([, r]) => r === "admin")) {
      return fail("A group chat needs at least one admin.");
    }
    const { error } = await actor.service
      .from("chat_members")
      .delete()
      .eq("conversation_id", conversationId)
      .in("user_id", ids);
    if (error) return fail(error.message);
    const people = await loadConnectPeople(actor.service, ids);
    await addSystemMessage(
      actor,
      conversationId,
      `${await nameOf(actor, actor.userId)} removed ${ids.map((id) => people.get(id)?.name ?? "someone").join(", ")}.`,
    );
  } else {
    if (role === "member" && changing.some((id) => current.get(id) === "admin")) {
      const admins = [...current.entries()].filter(([, r]) => r === "admin").map(([id]) => id);
      if (admins.every((id) => ids.includes(id))) {
        return fail("A group chat needs at least one admin.");
      }
    }
    if (adding.length) {
      const audience = await venueAudienceIds(actor);
      if (adding.some((id) => !audience.has(id))) return fail("Someone isn't on the Hub at this venue.");
    }
    const { error } = await actor.service.from("chat_members").upsert(
      ids.map((userId) => ({
        conversation_id: conversationId,
        user_id: userId,
        venue_id: actor.venueId,
        role,
        added_by: actor.userId,
      })),
      { onConflict: "conversation_id,user_id" },
    );
    if (error) return fail(error.message);
    if (adding.length) {
      const people = await loadConnectPeople(actor.service, adding);
      await addSystemMessage(
        actor,
        conversationId,
        `${await nameOf(actor, actor.userId)} added ${adding.map((id) => people.get(id)?.name ?? "someone").join(", ")}.`,
      );
    }
  }

  revalidateChats();
  return { ok: true };
}

export async function leaveGroupChat(conversationId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const conv = await getChatConversation(actor.service, actor.venueId, conversationId);
  if (!conv || conv.kind !== "group") return fail("Group chat not found.");
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return { ok: true };

  const { data: rows } = await actor.service
    .from("chat_members")
    .select("user_id, role")
    .eq("conversation_id", conversationId);
  const others = ((rows ?? []) as { user_id: string; role: ChatRole }[]).filter(
    (r) => r.user_id !== actor.userId,
  );
  if (membership.role === "admin" && others.length > 0 && !others.some((r) => r.role === "admin")) {
    return fail("Make someone else a chat admin before you leave.");
  }

  await addSystemMessage(actor, conversationId, `${await nameOf(actor, actor.userId)} left the chat.`);
  const { error } = await actor.service
    .from("chat_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", actor.userId);
  if (error) return fail(error.message);

  revalidateChats();
  return { ok: true };
}

/** Chat admins close a group chat for everyone (hidden, history kept). */
export async function archiveGroupChat(conversationId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const conv = await getChatConversation(actor.service, actor.venueId, conversationId);
  if (!conv || conv.kind !== "group") return fail("Group chat not found.");
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (membership?.role !== "admin") return fail("Only chat admins can delete this chat.");

  const { error } = await actor.service
    .from("chat_conversations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: actor.userId,
    action: "connect.chat.group.archive",
    module_key: CONNECT_MODULE_KEY,
    entity: "chat_conversations",
    entity_id: conversationId,
    venue_id: actor.venueId,
    before: { name: conv.name },
  });

  revalidateChats();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function sendChatMessage(
  formData: FormData,
): Promise<Result<{ message: ChatMessage }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const blob = asUploadBlob(formData.get("file"));

  if (!body && !blob) return fail("Write a message first.");
  if (body.length > CHAT_MAX_MESSAGE_CHARS) {
    return fail(`Messages can be up to ${CHAT_MAX_MESSAGE_CHARS} characters.`);
  }
  if (blob && blob.size > CONNECT_MAX_FILE_BYTES) return fail("Files must be 25 MB or smaller.");

  const conv = await getChatConversation(actor.service, actor.venueId, conversationId);
  if (!conv || conv.archived_at) return fail("Chat not found.");
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return fail("You're not in this chat.");
  if (conv.kind === "group" && conv.only_admins_can_post && membership.role !== "admin") {
    return fail("Only chat admins can send messages here.");
  }

  let attachment: Record<string, unknown> = {};
  if (blob) {
    const meta = uploadBlobMeta(blob);
    const bytes = Buffer.from(await blob.arrayBuffer());
    let buffer: Buffer = bytes;
    let contentType = meta.type || "application/octet-stream";
    let extension = /\.([a-z0-9]{1,8})$/i.exec(meta.name)?.[1]?.toLowerCase() ?? "bin";
    if (
      contentType.startsWith("image/") &&
      !/gif$/i.test(contentType) &&
      !shouldSkipWebpConversion(contentType, extension)
    ) {
      try {
        const webp = await convertImageToWebp(bytes, { maxWidth: 2000, maxHeight: 2000 });
        buffer = webp.buffer;
        contentType = webp.contentType;
        extension = webp.extension;
      } catch {
        // Keep the original if it cannot be converted.
      }
    }
    const path = `${actor.venueId}/chats/${conversationId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await actor.service.storage
      .from(CONNECT_BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (uploadError) return fail(`Couldn't upload ${meta.name}: ${uploadError.message}`);
    const { data: url } = actor.service.storage.from(CONNECT_BUCKET).getPublicUrl(path);
    attachment = {
      attachment_url: url.publicUrl,
      attachment_path: path,
      attachment_name: meta.name || `file.${extension}`,
      attachment_type: contentType,
      attachment_size: buffer.length,
    };
  }

  const { data, error } = await actor.service
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      venue_id: actor.venueId,
      sender_id: actor.userId,
      body,
      kind: "message",
      ...attachment,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error) return fail(error.message);
  const row = data as ChatMessageRow;

  await Promise.all([
    actor.service
      .from("chat_conversations")
      .update({ last_message_at: row.created_at })
      .eq("id", conversationId),
    actor.service
      .from("chat_members")
      .update({ last_read_at: row.created_at })
      .eq("conversation_id", conversationId)
      .eq("user_id", actor.userId),
  ]);

  after(() => notifyChatMessage(actor, conv, row));

  return { ok: true, message: mapChatMessageRow(row) };
}

async function notifyChatMessage(
  actor: ChatActor,
  conv: { id: string; kind: string; name: string },
  row: ChatMessageRow,
) {
  const { data: members } = await actor.service
    .from("chat_members")
    .select("user_id")
    .eq("conversation_id", conv.id);
  const recipients = ((members ?? []) as { user_id: string }[])
    .map((m) => m.user_id)
    .filter((id) => id !== actor.userId);
  if (recipients.length === 0) return;

  const sender = await nameOf(actor, actor.userId);
  const flat = row.body.replace(/\s+/g, " ").trim();
  const text = (flat.length > 120 ? `${flat.slice(0, 119)}…` : flat) || "📎 Sent an attachment";
  const isGroup = conv.kind === "group";
  const now = new Date().toISOString();

  // One live notification per chat per person: each new message refreshes it
  // (and re-alerts) instead of stacking dozens of rows.
  const { error } = await actor.service.from("notifications").upsert(
    recipients.map((userId) => ({
      user_id: userId,
      venue_id: actor.venueId,
      module_key: CONNECT_MODULE_KEY,
      type: "chat_message_new",
      title: isGroup ? `New message in ${conv.name}` : `New message from ${sender}`,
      body: isGroup ? `${sender}: ${text}` : text,
      entity: CHAT_NOTIFICATION_ENTITY,
      entity_id: conv.id,
      severity: "info",
      dedupe_key: `chat:${conv.id}:${userId}`,
      read_at: null,
      archived_at: null,
      push_sent_at: null,
      created_at: now,
    })),
    { onConflict: "dedupe_key" },
  );
  if (error) {
    console.error("[chat] notify failed:", error.message);
    return;
  }
  await dispatchPendingPushes(actor.service);
}

export async function deleteChatMessage(messageId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const { data } = await actor.service
    .from("chat_messages")
    .select("id, conversation_id, sender_id, attachment_path, kind")
    .eq("id", messageId)
    .eq("venue_id", actor.venueId)
    .maybeSingle();
  if (!data || data.kind !== "message") return fail("Message not found.");
  const membership = await getChatMembership(actor.service, data.conversation_id as string, actor.userId);
  if (!membership) return fail("Message not found.");
  if (data.sender_id !== actor.userId && membership.role !== "admin") {
    return fail("You can only delete your own messages.");
  }

  const { error } = await actor.service
    .from("chat_messages")
    .update({
      body: "",
      deleted_at: new Date().toISOString(),
      attachment_url: null,
      attachment_path: null,
      attachment_name: null,
      attachment_type: null,
      attachment_size: null,
    })
    .eq("id", messageId);
  if (error) return fail(error.message);
  if (data.attachment_path) {
    await actor.service.storage.from(CONNECT_BUCKET).remove([data.attachment_path as string]);
  }
  return { ok: true };
}

/** Load older messages for infinite scroll. */
export async function fetchChatMessages(
  conversationId: string,
  before: string,
): Promise<Result<{ messages: ChatMessage[]; hasMore: boolean }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return fail("Chat not found.");
  const page = await listChatMessages(actor.service, conversationId, before);
  return { ok: true, ...page };
}

/**
 * Archive (or restore) a chat for the viewer only. It reappears in the main
 * list once a newer message arrives.
 */
export async function setChatArchived(
  conversationId: string,
  archived: boolean,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return fail("Chat not found.");
  const { error } = await actor.service
    .from("chat_members")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("conversation_id", conversationId)
    .eq("user_id", actor.userId);
  if (error) {
    return fail(
      /archived_at/.test(error.message)
        ? "Archiving needs a database update that hasn't been applied yet."
        : error.message,
    );
  }
  revalidateChats();
  return { ok: true };
}

/** The viewer has seen everything in this chat: clear unread and its notification. */
export async function markChatRead(conversationId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const now = new Date().toISOString();
  await Promise.all([
    actor.service
      .from("chat_members")
      .update({ last_read_at: now })
      .eq("conversation_id", conversationId)
      .eq("user_id", actor.userId),
    actor.service
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", actor.userId)
      .eq("module_key", CONNECT_MODULE_KEY)
      .eq("entity", CHAT_NOTIFICATION_ENTITY)
      .eq("entity_id", conversationId)
      .is("read_at", null),
  ]);
  return { ok: true };
}

/** Shared photos, documents and links for the chat info panel. */
export async function fetchChatShared(
  conversationId: string,
): Promise<Result<{ shared: ChatShared }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const membership = await getChatMembership(actor.service, conversationId, actor.userId);
  if (!membership) return fail("Chat not found.");
  return { ok: true, shared: await listChatShared(actor.service, conversationId) };
}

/** Everything a side-by-side chat window needs (Chats page, extra panes). */
export async function fetchChatPane(conversationId: string): Promise<
  Result<{
    detail: ChatDetail;
    messages: ChatMessage[];
    hasMore: boolean;
    me: ConnectPerson | null;
    venuePeople: ConnectPerson[];
  }>
> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  const detail = await getChatDetail(actor.service, actor.venueId, conversationId, actor.userId);
  if (!detail) return fail("This chat isn't available.");
  const [page, venuePeople, people] = await Promise.all([
    listChatMessages(actor.service, conversationId),
    listVenueAppUsers(actor.service, actor.venueId),
    loadConnectPeople(actor.service, [actor.userId]),
  ]);
  return {
    ok: true,
    detail,
    messages: page.messages,
    hasMore: page.hasMore,
    me: people.get(actor.userId) ?? null,
    venuePeople,
  };
}
