import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_MESSAGES_PAGE_SIZE,
  isChatArchived,
  mapChatMessageRow,
  type ChatDetail,
  type ChatKind,
  type ChatMember,
  type ChatMessage,
  type ChatMessageRow,
  type ChatRole,
  type ChatContact,
  type ChatShared,
  type ChatSummary,
} from "./chat-types";
import type { ConnectPerson } from "./types";
import { listVenueAppUsers, loadConnectPeople } from "./store";

export type ChatConversationRow = {
  id: string;
  venue_id: string;
  kind: ChatKind;
  direct_key: string | null;
  name: string;
  description: string;
  color: string;
  only_admins_can_post: boolean;
  members_can_add: boolean;
  last_message_at: string | null;
  archived_at: string | null;
  created_at: string;
};

const CONVERSATION_SELECT =
  "id, venue_id, kind, direct_key, name, description, color, only_admins_can_post, members_can_add, last_message_at, archived_at, created_at";

const MESSAGE_SELECT =
  "id, conversation_id, sender_id, body, kind, attachment_url, attachment_name, attachment_type, attachment_size, created_at, edited_at, deleted_at";

export function directKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export async function getChatConversation(
  service: SupabaseClient,
  venueId: string,
  conversationId: string,
): Promise<ChatConversationRow | null> {
  const { data } = await service
    .from("chat_conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", conversationId)
    .eq("venue_id", venueId)
    .maybeSingle();
  return (data as ChatConversationRow | null) ?? null;
}

export async function getChatMembership(
  service: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<{ role: ChatRole; last_read_at: string } | null> {
  const { data } = await service
    .from("chat_members")
    .select("role, last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: ChatRole; last_read_at: string } | null) ?? null;
}

async function lastMessageFor(
  service: SupabaseClient,
  conversationId: string,
): Promise<ChatMessageRow | null> {
  const { data } = await service
    .from("chat_messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ChatMessageRow | null) ?? null;
}

async function unreadCountFor(
  service: SupabaseClient,
  conversationId: string,
  userId: string,
  lastReadAt: string,
): Promise<number> {
  const { count } = await service
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("kind", "message")
    .gt("created_at", lastReadAt)
    .neq("sender_id", userId);
  return count ?? 0;
}

/** The viewer's conversations at a venue, most recent activity first. */
export async function listMyChats(
  service: SupabaseClient,
  venueId: string,
  userId: string,
): Promise<ChatSummary[]> {
  type Membership = {
    conversation_id: string;
    last_read_at: string;
    archived_at?: string | null;
  };
  const withArchive = await service
    .from("chat_members")
    .select("conversation_id, last_read_at, archived_at")
    .eq("user_id", userId)
    .eq("venue_id", venueId);
  // Before the archived_at migration is applied, read without it.
  const mine: Membership[] | null = withArchive.error
    ? (
        await service
          .from("chat_members")
          .select("conversation_id, last_read_at")
          .eq("user_id", userId)
          .eq("venue_id", venueId)
      ).data
    : withArchive.data;
  const memberships = mine ?? [];
  if (memberships.length === 0) return [];
  const ids = memberships.map((m) => m.conversation_id);

  const [{ data: convs }, { data: allMembers }] = await Promise.all([
    service
      .from("chat_conversations")
      .select(CONVERSATION_SELECT)
      .in("id", ids)
      .is("archived_at", null),
    service.from("chat_members").select("conversation_id, user_id").in("conversation_id", ids),
  ]);
  const rows = (convs ?? []) as ChatConversationRow[];
  const membersByConv = new Map<string, string[]>();
  for (const m of (allMembers ?? []) as { conversation_id: string; user_id: string }[]) {
    membersByConv.set(m.conversation_id, [...(membersByConv.get(m.conversation_id) ?? []), m.user_id]);
  }
  const lastRead = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]));
  const archivedAt = new Map(memberships.map((m) => [m.conversation_id, m.archived_at ?? null]));

  const [lasts, unreads] = await Promise.all([
    Promise.all(rows.map((c) => lastMessageFor(service, c.id))),
    Promise.all(
      rows.map((c) => unreadCountFor(service, c.id, userId, lastRead.get(c.id) ?? c.created_at)),
    ),
  ]);

  const otherIds = rows
    .filter((c) => c.kind === "direct")
    .map((c) => (membersByConv.get(c.id) ?? []).find((id) => id !== userId) ?? "");
  const senderIds = lasts.map((m) => m?.sender_id ?? "");
  const people = await loadConnectPeople(service, [...otherIds, ...senderIds]);

  return rows
    .map((c, i): ChatSummary => {
      const memberIds = membersByConv.get(c.id) ?? [];
      const otherId = c.kind === "direct" ? (memberIds.find((id) => id !== userId) ?? null) : null;
      const other = otherId ? people.get(otherId) : null;
      const last = lasts[i];
      return {
        id: c.id,
        kind: c.kind,
        title: c.kind === "direct" ? (other?.name ?? "Former user") : c.name,
        photoUrl: c.kind === "direct" ? (other?.photoUrl ?? null) : null,
        color: c.color,
        otherUserId: otherId,
        memberCount: memberIds.length,
        lastMessage: last
          ? {
              body: last.body,
              kind: last.kind,
              senderId: last.sender_id,
              senderName: last.sender_id ? (people.get(last.sender_id)?.name ?? null) : null,
              hasAttachment: Boolean(last.attachment_url),
              deleted: Boolean(last.deleted_at),
              createdAt: last.created_at,
            }
          : null,
        activityAt: last?.created_at ?? c.created_at,
        unreadCount: unreads[i] ?? 0,
        archived: isChatArchived(archivedAt.get(c.id), last?.created_at),
      };
    })
    .sort((a, b) => b.activityAt.localeCompare(a.activityAt));
}

export async function getChatDetail(
  service: SupabaseClient,
  venueId: string,
  conversationId: string,
  userId: string,
): Promise<ChatDetail | null> {
  const conv = await getChatConversation(service, venueId, conversationId);
  if (!conv || conv.archived_at) return null;
  const membership = await getChatMembership(service, conversationId, userId);
  if (!membership) return null;

  const [{ data: memberRows }, last, unread] = await Promise.all([
    service.from("chat_members").select("user_id, role").eq("conversation_id", conversationId),
    lastMessageFor(service, conversationId),
    unreadCountFor(service, conversationId, userId, membership.last_read_at),
  ]);
  const rows = (memberRows ?? []) as { user_id: string; role: ChatRole }[];
  const people = await loadConnectPeople(service, [
    ...rows.map((r) => r.user_id),
    last?.sender_id ?? "",
  ]);

  const members: ChatMember[] = rows
    .map((r) => ({
      userId: r.user_id,
      role: r.role,
      person: people.get(r.user_id) ?? {
        userId: r.user_id,
        name: "Former user",
        photoUrl: null,
        positionName: null,
        departmentName: null,
      },
    }))
    .sort(
      (a, b) =>
        (a.role === "admin" ? 0 : 1) - (b.role === "admin" ? 0 : 1) ||
        a.person.name.localeCompare(b.person.name),
    );

  const other =
    conv.kind === "direct" ? (members.find((m) => m.userId !== userId) ?? null) : null;
  const contact = other ? await loadChatContact(service, other.userId, venueId) : null;
  const isAdmin = membership.role === "admin";
  const isGroup = conv.kind === "group";

  return {
    id: conv.id,
    kind: conv.kind,
    title: isGroup ? conv.name : (other?.person.name ?? "Former user"),
    photoUrl: isGroup ? null : (other?.person.photoUrl ?? null),
    color: conv.color,
    otherUserId: other?.userId ?? null,
    memberCount: members.length,
    lastMessage: last
      ? {
          body: last.body,
          kind: last.kind,
          senderId: last.sender_id,
          senderName: last.sender_id ? (people.get(last.sender_id)?.name ?? null) : null,
          hasAttachment: Boolean(last.attachment_url),
          deleted: Boolean(last.deleted_at),
          createdAt: last.created_at,
        }
      : null,
    activityAt: last?.created_at ?? conv.created_at,
    unreadCount: unread,
    archived: false,
    contact,
    description: conv.description,
    onlyAdminsCanPost: conv.only_admins_can_post,
    membersCanAdd: conv.members_can_add,
    myRole: membership.role,
    members,
    canPost: !isGroup || isAdmin || !conv.only_admins_can_post,
    canManage: isGroup && isAdmin,
    canAddMembers: isGroup && (isAdmin || conv.members_can_add),
  };
}

/** Messages oldest → newest; `before` pages backwards in time. */
export async function listChatMessages(
  service: SupabaseClient,
  conversationId: string,
  before?: string | null,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  let query = service
    .from("chat_messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(CHAT_MESSAGES_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) {
    console.error("[chat] listChatMessages:", error.message);
    return { messages: [], hasMore: false };
  }
  const rows = (data ?? []) as ChatMessageRow[];
  return {
    messages: rows.slice(0, CHAT_MESSAGES_PAGE_SIZE).reverse().map(mapChatMessageRow),
    hasMore: rows.length > CHAT_MESSAGES_PAGE_SIZE,
  };
}

type ContactStaff = {
  joining_date: string | null;
  position: { name: string } | { name: string }[] | null;
  department: { name: string } | { name: string }[] | null;
};

const CONTACT_STAFF_SELECT =
  "joining_date, position:positions(name), department:departments(name)";

function relName(value: ContactStaff["position"]): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name?.trim() || null;
}

/**
 * Work details for the other person in a 1:1 chat. Uses their linked staff
 * record, or — when the login isn't linked — the venue staff record whose
 * work / personal email matches the login email.
 */
async function loadChatContact(
  service: SupabaseClient,
  userId: string,
  venueId: string,
): Promise<ChatContact> {
  const { data } = await service
    .from("profiles")
    .select(`email, staff:staff(${CONTACT_STAFF_SELECT})`)
    .eq("id", userId)
    .maybeSingle();
  const row = data as { email: string | null; staff: ContactStaff | ContactStaff[] | null } | null;
  let staff = (Array.isArray(row?.staff) ? row?.staff[0] : row?.staff) ?? null;

  const email = row?.email?.trim() || null;
  if (!staff && email) {
    const { data: matches } = await service
      .from("staff")
      .select(CONTACT_STAFF_SELECT)
      .eq("home_venue_id", venueId)
      .or(`work_email.ilike.${email},personal_email.ilike.${email}`)
      .limit(1);
    staff = ((matches ?? []) as ContactStaff[])[0] ?? null;
  }

  return {
    email,
    joiningDate: staff?.joining_date ?? null,
    positionName: relName(staff?.position ?? null),
    departmentName: relName(staff?.department ?? null),
  };
}

const URL_PATTERN = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g;

/** Photos, documents and links shared in a chat, newest first. */
export async function listChatShared(
  service: SupabaseClient,
  conversationId: string,
): Promise<ChatShared> {
  const { data } = await service
    .from("chat_messages")
    .select("id, sender_id, body, attachment_url, attachment_name, attachment_type, attachment_size, created_at")
    .eq("conversation_id", conversationId)
    .eq("kind", "message")
    .is("deleted_at", null)
    .or("attachment_url.not.is.null,body.ilike.%http%")
    .order("created_at", { ascending: false })
    .limit(500);

  const shared: ChatShared = { images: [], documents: [], links: [] };
  for (const m of (data ?? []) as {
    id: string;
    sender_id: string | null;
    body: string;
    attachment_url: string | null;
    attachment_name: string | null;
    attachment_type: string | null;
    attachment_size: number | null;
    created_at: string;
  }[]) {
    const base = { messageId: m.id, senderId: m.sender_id, createdAt: m.created_at };
    if (m.attachment_url) {
      const item = {
        ...base,
        url: m.attachment_url,
        name: m.attachment_name ?? "file",
        type: m.attachment_type ?? "application/octet-stream",
        size: Number(m.attachment_size) || 0,
      };
      if (/^image\//.test(item.type)) shared.images.push(item);
      else shared.documents.push(item);
    }
    for (const url of m.body.match(URL_PATTERN) ?? []) {
      shared.links.push({ ...base, url, name: url, type: "link", size: 0 });
    }
  }
  return shared;
}

/**
 * People for the chat Directory: everyone on the Hub at this venue except the
 * viewer. Logins not linked to a staff record borrow position / department
 * from the venue staff record with a matching email.
 */
export async function listChatDirectory(
  service: SupabaseClient,
  venueId: string,
  viewerId: string,
): Promise<ConnectPerson[]> {
  const people = (await listVenueAppUsers(service, venueId)).filter((p) => p.userId !== viewerId);
  const missing = people.filter((p) => !p.positionName && !p.departmentName);
  if (missing.length === 0) return people;

  const { data: profiles } = await service
    .from("profiles")
    .select("id, email")
    .in(
      "id",
      missing.map((p) => p.userId),
    );
  const emails = ((profiles ?? []) as { id: string; email: string | null }[])
    .map((p) => ({ id: p.id, email: p.email?.trim().toLowerCase() ?? "" }))
    .filter((p) => p.email);
  if (emails.length === 0) return people;

  const { data: staffRows } = await service
    .from("staff")
    .select(`work_email, personal_email, ${CONTACT_STAFF_SELECT}`)
    .eq("home_venue_id", venueId)
    .or(
      emails
        .flatMap((e) => [`work_email.ilike.${e.email}`, `personal_email.ilike.${e.email}`])
        .join(","),
    );
  const byEmail = new Map<string, ContactStaff>();
  for (const row of (staffRows ?? []) as (ContactStaff & {
    work_email: string | null;
    personal_email: string | null;
  })[]) {
    for (const email of [row.work_email, row.personal_email]) {
      if (email) byEmail.set(email.trim().toLowerCase(), row);
    }
  }
  const staffByUser = new Map(
    emails.map((e) => [e.id, byEmail.get(e.email) ?? null] as const),
  );

  return people.map((p) => {
    const staff = staffByUser.get(p.userId);
    if (!staff) return p;
    return {
      ...p,
      positionName: relName(staff.position),
      departmentName: relName(staff.department),
    };
  });
}
