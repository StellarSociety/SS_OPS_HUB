import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchPendingPushes } from "@/lib/push/send";
import { decodeMentions, mentionedUserIds } from "./mentions";
import { listGroupMembers, loadConnectPeople } from "./store";
import {
  CONNECT_MODULE_KEY,
  CONNECT_REACTION_EMOJI,
  type ConnectAutoMemberRole,
  type ConnectReaction,
} from "./types";

/** Notification `entity` for Connecteam posts; `entity_id` is `<groupId>:<postId>`. */
export const CONNECT_POST_ENTITY = "connect_post";

type GroupRef = {
  id: string;
  venue_id: string;
  name: string;
  auto_member_role: ConnectAutoMemberRole | null;
};

type Draft = {
  userId: string;
  type: "connect_post_new" | "connect_comment_new" | "connect_reaction_new" | "connect_mention";
  title: string;
  body: string;
  dedupeKey: string;
};

function snippet(text: string, max = 120): string {
  const flat = decodeMentions(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

async function personName(service: SupabaseClient, userId: string): Promise<string> {
  const people = await loadConnectPeople(service, [userId]);
  return people.get(userId)?.name ?? "Someone";
}

async function send(
  service: SupabaseClient,
  group: GroupRef,
  postId: string,
  drafts: Draft[],
) {
  if (drafts.length === 0) return;
  const rows = drafts.map((d) => ({
    user_id: d.userId,
    venue_id: group.venue_id,
    module_key: CONNECT_MODULE_KEY,
    type: d.type,
    title: d.title,
    body: d.body,
    entity: CONNECT_POST_ENTITY,
    entity_id: `${group.id}:${postId}`,
    severity: "info" as const,
    dedupe_key: d.dedupeKey,
  }));
  // ignoreDuplicates: re-reacting or toggling never re-sends the same alert.
  const { error } = await service
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) {
    console.error("[connect] notify failed:", error.message);
    return;
  }
  await dispatchPendingPushes(service);
}

/** Everyone in the group (explicit + automatic members) except the author. */
export async function notifyNewPost(
  service: SupabaseClient,
  input: { group: GroupRef; postId: string; authorId: string; body: string; hasFiles: boolean },
) {
  // People tagged in the post get a "mentioned you" alert instead.
  const mentioned = new Set(mentionedUserIds(input.body));
  const [members, author] = await Promise.all([
    listGroupMembers(service, {
      id: input.group.id,
      venueId: input.group.venue_id,
      autoMemberRole: input.group.auto_member_role,
    }),
    personName(service, input.authorId),
  ]);
  const text = snippet(input.body) || (input.hasFiles ? "shared a photo or file" : "posted");
  await send(
    service,
    input.group,
    input.postId,
    members
      .filter((m) => m.userId !== input.authorId && !mentioned.has(m.userId))
      .map((m) => ({
        userId: m.userId,
        type: "connect_post_new",
        title: `New post on ${input.group.name}`,
        body: `${author}: ${text}`,
        dedupeKey: `connect-post:${input.postId}:${m.userId}`,
      })),
  );
}

/** The post's author, when someone else comments on it. */
export async function notifyNewComment(
  service: SupabaseClient,
  input: {
    group: GroupRef;
    postId: string;
    postAuthorId: string | null;
    commentId: string;
    commenterId: string;
    body: string;
  },
) {
  if (!input.postAuthorId || input.postAuthorId === input.commenterId) return;
  // Tagged authors get the "mentioned you" alert instead.
  if (mentionedUserIds(input.body).includes(input.postAuthorId)) return;
  const name = await personName(service, input.commenterId);
  await send(service, input.group, input.postId, [
    {
      userId: input.postAuthorId,
      type: "connect_comment_new",
      title: `New comment on ${input.group.name}`,
      body: `${name} commented on your post: ${snippet(input.body)}`,
      dedupeKey: `connect-comment:${input.commentId}:${input.postAuthorId}`,
    },
  ]);
}

/** The author of the post or comment someone reacted to. */
export async function notifyNewReaction(
  service: SupabaseClient,
  input: {
    group: GroupRef;
    postId: string;
    target: { kind: "post" | "comment"; id: string; authorId: string | null };
    reactorId: string;
    reaction: ConnectReaction;
  },
) {
  const { target } = input;
  if (!target.authorId || target.authorId === input.reactorId) return;
  const name = await personName(service, input.reactorId);
  await send(service, input.group, input.postId, [
    {
      userId: target.authorId,
      type: "connect_reaction_new",
      title: `New reaction on ${input.group.name}`,
      body: `${name} reacted ${CONNECT_REACTION_EMOJI[input.reaction]} to your ${target.kind}.`,
      dedupeKey: `connect-reaction:${target.kind}:${target.id}:${input.reactorId}`,
    },
  ]);
}

/** Mark Connecteam notifications read once the user has seen the feed / group. */
export async function markConnectNotificationsRead(
  service: SupabaseClient,
  input: { userId: string; venueId: string; groupId?: string | null },
) {
  let query = service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .eq("venue_id", input.venueId)
    .eq("module_key", CONNECT_MODULE_KEY)
    .eq("entity", CONNECT_POST_ENTITY)
    .is("read_at", null);
  if (input.groupId) query = query.like("entity_id", `${input.groupId}:%`);
  const { error } = await query;
  if (error) console.error("[connect] mark read failed:", error.message);
}

/**
 * People @mentioned in a post or comment who can see the group. Safe to call
 * again after an edit: each person is alerted once per post / comment.
 */
export async function notifyMentions(
  service: SupabaseClient,
  input: {
    group: GroupRef;
    postId: string;
    /** Post or comment id, for de-duplication. */
    sourceId: string;
    kind: "post" | "comment";
    authorId: string;
    body: string;
  },
) {
  const ids = mentionedUserIds(input.body).filter((id) => id !== input.authorId);
  if (ids.length === 0) return;
  const [members, author] = await Promise.all([
    listGroupMembers(service, {
      id: input.group.id,
      venueId: input.group.venue_id,
      autoMemberRole: input.group.auto_member_role,
    }),
    personName(service, input.authorId),
  ]);
  const canSee = new Set(members.map((m) => m.userId));
  await send(
    service,
    input.group,
    input.postId,
    ids
      .filter((id) => canSee.has(id))
      .map((userId) => ({
        userId,
        type: "connect_mention" as const,
        title: `${author} mentioned you`,
        body: `${input.kind === "post" ? "In a post" : "In a comment"} on ${input.group.name}: ${snippet(input.body)}`,
        dedupeKey: `connect-mention:${input.sourceId}:${userId}`,
      })),
  );
}
