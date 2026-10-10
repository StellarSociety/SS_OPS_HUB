"use server";

import { getChatDetail, listChatMessages, listMyChats } from "@/lib/connect/chat-store";
import type { ChatDetail, ChatMessage, ChatSummary } from "@/lib/connect/chat-types";
import {
  canAccessConnectSettings,
  canAdminConnect,
} from "@/lib/connect/permissions";
import {
  listConnectGroups,
  listConnectPosts,
  listVenueAppUsers,
  loadConnectPeople,
} from "@/lib/connect/store";
import type { ConnectGroup, ConnectPerson, ConnectPost } from "@/lib/connect/types";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import type { UserPermission } from "@/lib/role-permissions";
import { createServiceClient } from "@/lib/supabase/service";

export type PreviewConnectData = {
  meId: string;
  me: ConnectPerson | null;
  chats: ChatSummary[];
  groups: ConnectGroup[];
  posts: ConnectPost[];
  nextBefore: string | null;
  /** True when showing someone other than the signed-in user (read-only). */
  impersonating: boolean;
};

/**
 * The Hub login for a staff record: the profile linked to it, or (when the
 * login isn't linked) the profile whose email matches the staff work /
 * personal email — the same fallback chat contact details use.
 */
async function hubUserForStaff(
  service: ReturnType<typeof createServiceClient>,
  staffId: string,
): Promise<string | null> {
  const { data: linked } = await service
    .from("profiles")
    .select("id")
    .eq("staff_id", staffId)
    .limit(1)
    .maybeSingle();
  if (linked?.id) return String(linked.id);

  const { data: staff } = await service
    .from("staff")
    .select("work_email, personal_email")
    .eq("id", staffId)
    .maybeSingle();
  const emails = [staff?.work_email, staff?.personal_email]
    .map((e) => String(e ?? "").trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    const { data: byEmail } = await service
      .from("profiles")
      .select("id")
      // Case-insensitive exact match: escape LIKE wildcards in the address.
      .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1)
      .maybeSingle();
    if (byEmail?.id) return String(byEmail.id);
  }
  return null;
}

type Resolved =
  | { ok: true; venueId: string; userId: string; impersonating: boolean }
  | { ok: false; error: string };

/**
 * Who the simulator shows Connecteam as: the signed-in user, or (for
 * Connecteam admins only, since chats are private) the hub login linked to
 * the selected employee.
 */
async function resolvePreviewUser(venueId: string, staffId: string | null): Promise<Resolved> {
  const access = await requireMobileAppVenueAccess(venueId);
  if (!access) return { ok: false, error: "No access to the mobile app preview." };
  if (!staffId) return { ok: true, venueId: access.venueId, userId: access.userId, impersonating: false };

  const service = createServiceClient();
  const { data: myPermissions } = await service
    .from("user_permissions")
    .select("*")
    .eq("user_id", access.userId);
  if (!canAdminConnect((myPermissions ?? []) as UserPermission[], access.venueId)) {
    return { ok: false, error: "Only Connecteam admins can preview another employee's chats." };
  }

  const userId = await hubUserForStaff(service, staffId);
  if (!userId) return { ok: false, error: "This employee has no Hub login, so they have no chats." };
  return {
    ok: true,
    venueId: access.venueId,
    userId,
    impersonating: userId !== access.userId,
  };
}

/** Chats, groups and feed as the previewed user sees them. */
export async function loadPreviewConnect(input: {
  venueId: string;
  staffId: string | null;
}): Promise<{ ok: true; data: PreviewConnectData } | { ok: false; error: string }> {
  const who = await resolvePreviewUser(input.venueId, input.staffId);
  if (!who.ok) return who;

  const service = createServiceClient();
  const { data: permissionRows } = await service
    .from("user_permissions")
    .select("*")
    .eq("user_id", who.userId);
  const permissions = (permissionRows ?? []) as UserPermission[];

  const [chats, groups, people] = await Promise.all([
    listMyChats(service, who.venueId, who.userId),
    listConnectGroups(service, who.venueId, {
      userId: who.userId,
      seesAllGroups: canAccessConnectSettings(permissions, who.venueId),
      isConnectAdmin: canAdminConnect(permissions, who.venueId),
    }),
    loadConnectPeople(service, [who.userId]),
  ]);
  const visible = groups.filter((group) => group.myRole !== null);
  const { posts, nextBefore } = await listConnectPosts(service, {
    venueId: who.venueId,
    groups: visible,
    viewerId: who.userId,
  });

  return {
    ok: true,
    data: {
      meId: who.userId,
      me: people.get(who.userId) ?? null,
      chats,
      groups: visible,
      posts,
      nextBefore,
      impersonating: who.impersonating,
    },
  };
}

/** One conversation for the simulator, as the previewed user. */
export async function loadPreviewChat(input: {
  venueId: string;
  staffId: string | null;
  conversationId: string;
}): Promise<
  | {
      ok: true;
      detail: ChatDetail;
      messages: ChatMessage[];
      hasMore: boolean;
      me: ConnectPerson | null;
      venuePeople: ConnectPerson[];
      impersonating: boolean;
    }
  | { ok: false; error: string }
> {
  const who = await resolvePreviewUser(input.venueId, input.staffId);
  if (!who.ok) return who;
  const service = createServiceClient();
  const detail = await getChatDetail(service, who.venueId, input.conversationId, who.userId);
  if (!detail) return { ok: false, error: "This chat is no longer available." };
  const [{ messages, hasMore }, venuePeople, people] = await Promise.all([
    listChatMessages(service, input.conversationId),
    listVenueAppUsers(service, who.venueId),
    loadConnectPeople(service, [who.userId]),
  ]);
  return {
    ok: true,
    detail,
    messages,
    hasMore,
    me: people.get(who.userId) ?? null,
    venuePeople,
    impersonating: who.impersonating,
  };
}
