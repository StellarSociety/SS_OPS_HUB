import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canManageProfileAvatar } from "@/lib/user/can-manage-profile-avatar";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import {
  effectiveGroupRole,
  roleCanInteract,
  roleCanModerate,
  roleCanPost,
} from "./permissions";
import {
  CONNECT_POSTS_PAGE_SIZE,
  isConnectGroupRole,
  isConnectReaction,
  type ConnectAttachment,
  type ConnectAutoMemberRole,
  type ConnectComment,
  type ConnectDepartmentRuleRole,
  type ConnectGroup,
  type ConnectGroupMember,
  type ConnectGroupRole,
  type ConnectPerson,
  type ConnectPost,
  type ConnectReaction,
} from "./types";

type Rel<T> = T | T[] | null | undefined;

function one<T>(value: Rel<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type GroupRow = {
  id: string;
  venue_id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  archived_at: string | null;
  auto_member_role: ConnectAutoMemberRole | null;
};

const GROUP_SELECT =
  "id, venue_id, name, description, icon, color, sort_order, archived_at, auto_member_role";

type MemberRow = { group_id: string; user_id: string; role: string };

type DepartmentRuleRow = {
  group_id: string;
  department_id: string;
  role: ConnectDepartmentRuleRole;
  department: Rel<{ name: string }>;
};

/** A Hub user with access at the venue, and their HR department (via staff link). */
type AudienceMember = { userId: string; departmentId: string | null };

const ROLE_RANK: Record<ConnectGroupRole, number> = {
  viewer: 1,
  contributor: 2,
  moderator: 3,
  admin: 4,
};

type AutoRole = { role: ConnectGroupRole; source: string };

/**
 * Automatic role for one person: the group's "everyone" role and any matching
 * department rule — the higher of the two wins.
 */
function autoRoleFor(
  group: Pick<GroupRow, "auto_member_role">,
  rules: DepartmentRuleRow[],
  member: AudienceMember | null,
): AutoRole | null {
  if (!member) return null;
  let best: AutoRole | null = group.auto_member_role
    ? { role: group.auto_member_role, source: "Everyone" }
    : null;
  for (const rule of rules) {
    if (!member.departmentId || rule.department_id !== member.departmentId) continue;
    if (!best || ROLE_RANK[rule.role] > ROLE_RANK[best.role]) {
      best = { role: rule.role, source: one(rule.department)?.name ?? "Department" };
    }
  }
  return best;
}

async function listDepartmentRules(
  service: SupabaseClient,
  filter: { venueId: string } | { groupId: string },
): Promise<DepartmentRuleRow[]> {
  let query = service
    .from("connect_group_department_rules")
    .select("group_id, department_id, role, department:departments(name)");
  query =
    "groupId" in filter
      ? query.eq("group_id", filter.groupId)
      : query.eq("venue_id", filter.venueId);
  const { data, error } = await query;
  if (error) {
    console.error("[connect] listDepartmentRules:", error.message);
    return [];
  }
  return (data ?? []) as unknown as DepartmentRuleRow[];
}

/** Active Hub users with any grant at this venue (or a global grant). */
async function loadVenueAudience(
  service: SupabaseClient,
  venueId: string,
  onlyUserId?: string,
): Promise<AudienceMember[]> {
  let grantsQuery = service
    .from("user_permissions")
    .select("user_id")
    .or(`venue_id.is.null,venue_id.eq.${venueId}`);
  if (onlyUserId) grantsQuery = grantsQuery.eq("user_id", onlyUserId);
  const { data: grants } = await grantsQuery;
  const ids = [...new Set((grants ?? []).map((g) => g.user_id as string))];
  if (ids.length === 0) return [];

  const { data: active } = await service
    .from("profiles")
    .select("id, staff:staff(department_id)")
    .in("id", ids)
    .eq("status", "active");
  return ((active ?? []) as { id: string; staff: Rel<{ department_id: string | null }> }[]).map(
    (p) => ({ userId: p.id, departmentId: one(p.staff)?.department_id ?? null }),
  );
}

/**
 * Groups the viewer can see at a venue: explicit memberships, automatic ones
 * (everyone / department rules), or every group for Connecteam settings
 * viewers. Archived groups are only listed when asked.
 */
export async function listConnectGroups(
  service: SupabaseClient,
  venueId: string,
  viewer: { userId: string; seesAllGroups: boolean; isConnectAdmin: boolean },
  options: { includeArchived?: boolean } = {},
): Promise<ConnectGroup[]> {
  let query = service
    .from("connect_groups")
    .select(GROUP_SELECT)
    .eq("venue_id", venueId)
    .order("sort_order")
    .order("name");
  if (!options.includeArchived) query = query.is("archived_at", null);

  const [{ data: groupRows, error }, { data: memberRows }, rules] = await Promise.all([
    query,
    service
      .from("connect_group_members")
      .select("group_id, user_id, role")
      .eq("venue_id", venueId),
    listDepartmentRules(service, { venueId }),
  ]);

  if (error) {
    console.error("[connect] listConnectGroups:", error.message);
    return [];
  }

  const members = (memberRows ?? []) as MemberRow[];
  const memberIds = new Map<string, Set<string>>();
  const myRoles = new Map<string, ConnectGroupRole>();
  for (const m of members) {
    const ids = memberIds.get(m.group_id) ?? new Set<string>();
    ids.add(m.user_id);
    memberIds.set(m.group_id, ids);
    if (m.user_id === viewer.userId && isConnectGroupRole(m.role)) {
      myRoles.set(m.group_id, m.role);
    }
  }

  const rulesByGroup = new Map<string, DepartmentRuleRow[]>();
  for (const r of rules) {
    rulesByGroup.set(r.group_id, [...(rulesByGroup.get(r.group_id) ?? []), r]);
  }

  const rows = (groupRows ?? []) as GroupRow[];
  const needsAudience = rows.some((g) => g.auto_member_role || rulesByGroup.has(g.id));
  const audience = needsAudience ? await loadVenueAudience(service, venueId) : [];
  const me = audience.find((a) => a.userId === viewer.userId) ?? null;

  const countFor = (g: GroupRow): number => {
    const ids = new Set(memberIds.get(g.id) ?? []);
    const groupRules = rulesByGroup.get(g.id) ?? [];
    for (const person of audience) {
      if (autoRoleFor(g, groupRules, person)) ids.add(person.userId);
    }
    return ids.size;
  };

  return rows
    .map((g) => {
      const groupRules = rulesByGroup.get(g.id) ?? [];
      const auto = autoRoleFor(g, groupRules, me);
      return {
        row: g,
        auto,
        group: {
          id: g.id,
          venueId: g.venue_id,
          name: g.name,
          description: g.description,
          icon: g.icon,
          color: g.color,
          sortOrder: g.sort_order,
          archivedAt: g.archived_at,
          autoMemberRole: g.auto_member_role,
          departmentRules: groupRules.map((r) => ({
            departmentId: r.department_id,
            departmentName: one(r.department)?.name ?? "Department",
            role: r.role,
          })),
          memberCount: countFor(g),
          myRole: effectiveGroupRole(
            myRoles.get(g.id) ?? null,
            viewer.isConnectAdmin,
            auto?.role ?? null,
          ),
        } satisfies ConnectGroup,
      };
    })
    .filter(
      ({ row, auto }) => viewer.seesAllGroups || myRoles.has(row.id) || auto !== null,
    )
    .map(({ group }) => group);
}

/** Effective role from an explicit membership, else automatic membership rules. */
export async function resolveMemberRole(
  service: SupabaseClient,
  group: Pick<GroupRow, "id" | "venue_id" | "auto_member_role">,
  userId: string,
): Promise<ConnectGroupRole | null> {
  const explicit = await getGroupMemberRole(service, group.id, userId);
  if (explicit) return explicit;
  const rules = await listDepartmentRules(service, { groupId: group.id });
  if (!group.auto_member_role && rules.length === 0) return null;
  const [me] = await loadVenueAudience(service, group.venue_id, userId);
  return autoRoleFor(group, rules, me ?? null)?.role ?? null;
}

export async function getGroupMemberRole(
  service: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<ConnectGroupRole | null> {
  const { data } = await service
    .from("connect_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data?.role as string | undefined) ?? null;
  return role && isConnectGroupRole(role) ? role : null;
}

export async function getConnectGroupRow(
  service: SupabaseClient,
  venueId: string,
  groupId: string,
): Promise<GroupRow | null> {
  const { data } = await service
    .from("connect_groups")
    .select(GROUP_SELECT)
    .eq("id", groupId)
    .eq("venue_id", venueId)
    .maybeSingle();
  return (data as GroupRow | null) ?? null;
}

/** HR departments at the venue (for department membership rules). */
export async function listVenueDepartments(
  service: SupabaseClient,
  venueId: string,
): Promise<{ id: string; name: string }[]> {
  const { data } = await service
    .from("departments")
    .select("id, name")
    .eq("venue_id", venueId)
    .order("sort_order")
    .order("name");
  return (data ?? []) as { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// People (profiles + linked HR staff photo / position)
// ---------------------------------------------------------------------------

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  status?: string | null;
  avatar_url?: string | null;
  is_external?: boolean | null;
  staff: Rel<{
    emp_no: string | null;
    full_name: string | null;
    photo_url: string | null;
    position: Rel<{ name: string }>;
    department: Rel<{ name: string }>;
  }>;
};

const PROFILE_SELECT = `
  id, full_name, email, status, avatar_url, is_external,
  staff:staff(emp_no, full_name, photo_url, position:positions(name), department:departments(name))
`;

function mapPerson(row: ProfileRow): ConnectPerson {
  const staff = one(row.staff);
  const name =
    row.full_name?.trim() ||
    staff?.full_name?.trim() ||
    row.email.split("@")[0] ||
    "Team member";
  return {
    userId: row.id,
    name,
    // Same photo the Hub header shows for this person.
    photoUrl: resolveAvatarUrl({
      profileAvatarUrl: row.avatar_url,
      staffPhotoUrl: staff?.photo_url ?? null,
      preferStaffPhoto: !canManageProfileAvatar({
        is_external: row.is_external,
        email: row.email,
        staff: staff ? { emp_no: staff.emp_no } : null,
      }),
    }),
    positionName: one(staff?.position)?.name ?? null,
    departmentName: one(staff?.department)?.name ?? null,
  };
}

export async function loadConnectPeople(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, ConnectPerson>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, ConnectPerson>();
  if (ids.length === 0) return map;

  const { data, error } = await service
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("id", ids);
  if (error) {
    console.error("[connect] loadConnectPeople:", error.message);
    return map;
  }
  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, mapPerson(row));
  }
  return map;
}

/** Active app users who have any access at this venue (candidates for groups). */
export async function listVenueAppUsers(
  service: SupabaseClient,
  venueId: string,
): Promise<ConnectPerson[]> {
  const audience = await loadVenueAudience(service, venueId);
  const people = await loadConnectPeople(
    service,
    audience.map((a) => a.userId),
  );
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listGroupMembers(
  service: SupabaseClient,
  group: { id: string; venueId: string; autoMemberRole: ConnectAutoMemberRole | null },
): Promise<ConnectGroupMember[]> {
  const [{ data }, rules] = await Promise.all([
    service.from("connect_group_members").select("user_id, role").eq("group_id", group.id),
    listDepartmentRules(service, { groupId: group.id }),
  ]);
  const audience =
    group.autoMemberRole || rules.length > 0
      ? await loadVenueAudience(service, group.venueId)
      : [];

  const explicit = ((data ?? []) as { user_id: string; role: string }[]).filter((r) =>
    isConnectGroupRole(r.role),
  );
  const explicitIds = new Set(explicit.map((r) => r.user_id));
  const groupForRules = { auto_member_role: group.autoMemberRole };
  const rows: { userId: string; role: ConnectGroupRole; autoSource: string | null }[] = [
    ...explicit.map((r) => ({
      userId: r.user_id,
      role: r.role as ConnectGroupRole,
      autoSource: null,
    })),
  ];
  for (const person of audience) {
    if (explicitIds.has(person.userId)) continue;
    const auto = autoRoleFor(groupForRules, rules, person);
    if (auto) rows.push({ userId: person.userId, role: auto.role, autoSource: auto.source });
  }

  const people = await loadConnectPeople(
    service,
    rows.map((r) => r.userId),
  );

  return rows
    .map((r) => ({
      userId: r.userId,
      role: r.role,
      auto: r.autoSource !== null,
      autoSource: r.autoSource,
      person: people.get(r.userId) ?? {
        userId: r.userId,
        name: "Former user",
        photoUrl: null,
        positionName: null,
        departmentName: null,
      },
    }))
    .sort((a, b) => a.person.name.localeCompare(b.person.name));
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

type PostRow = {
  id: string;
  group_id: string;
  author_id: string | null;
  body: string;
  kind: "post" | "celebration";
  celebration_kind: "birthday" | "anniversary" | "shoutout" | null;
  celebration_years: number | null;
  pinned_at: string | null;
  edited_at: string | null;
  created_at: string;
  celebration_staff: Rel<{ full_name: string; photo_url: string | null }>;
  attachments: {
    id: string;
    file_url: string;
    content_type: string;
    original_name: string;
    file_size: number;
    sort_order: number;
  }[];
  reactions: { user_id: string; reaction: string }[];
};

type CommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  likes: { user_id: string }[];
};

const POST_SELECT = `
  id, group_id, author_id, body, kind, celebration_kind, celebration_years,
  pinned_at, edited_at, created_at,
  celebration_staff:staff(full_name, photo_url),
  attachments:connect_post_attachments(id, file_url, content_type, original_name, file_size, sort_order),
  reactions:connect_post_reactions(user_id, reaction)
`;

export type ListPostsOptions = {
  venueId: string;
  groups: ConnectGroup[];
  viewerId: string;
  /** ISO timestamp — only posts strictly older than this. */
  before?: string | null;
  /** Show pinned posts above the timeline (group view). */
  pinnedFirst?: boolean;
  limit?: number;
};

export async function listConnectPosts(
  service: SupabaseClient,
  options: ListPostsOptions,
): Promise<{ posts: ConnectPost[]; nextBefore: string | null }> {
  const limit = options.limit ?? CONNECT_POSTS_PAGE_SIZE;
  const groupsById = new Map(options.groups.map((g) => [g.id, g]));
  const groupIds = [...groupsById.keys()];
  if (groupIds.length === 0) return { posts: [], nextBefore: null };

  // Pinned posts sit above the timeline on the first page of a group, and are
  // left out of the paginated timeline so they never repeat.
  let query = service
    .from("connect_posts")
    .select(POST_SELECT)
    .eq("venue_id", options.venueId)
    .in("group_id", groupIds)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (options.pinnedFirst) query = query.is("pinned_at", null);
  if (options.before) query = query.lt("created_at", options.before);

  const pinnedQuery =
    options.pinnedFirst && !options.before
      ? service
          .from("connect_posts")
          .select(POST_SELECT)
          .eq("venue_id", options.venueId)
          .in("group_id", groupIds)
          .not("pinned_at", "is", null)
          .order("pinned_at", { ascending: false })
      : null;

  const [{ data, error }, pinnedResult] = await Promise.all([
    query,
    pinnedQuery ?? Promise.resolve({ data: [] as unknown[] }),
  ]);
  if (error) {
    console.error("[connect] listConnectPosts:", error.message);
    return { posts: [], nextBefore: null };
  }

  const rows = (data ?? []) as unknown as PostRow[];
  const hasMore = rows.length > limit;
  const timeline = rows.slice(0, limit);
  const pinned = (pinnedResult.data ?? []) as unknown as PostRow[];
  const page = [...pinned, ...timeline];
  const postIds = page.map((p) => p.id);

  const { data: commentData } = postIds.length
    ? await service
        .from("connect_comments")
        .select(
          "id, post_id, parent_id, author_id, body, created_at, edited_at, likes:connect_comment_likes(user_id)",
        )
        .in("post_id", postIds)
        .order("created_at")
    : { data: [] };
  const commentRows = (commentData ?? []) as unknown as CommentRow[];

  const people = await loadConnectPeople(service, [
    ...page.map((p) => p.author_id ?? ""),
    ...commentRows.map((c) => c.author_id ?? ""),
  ]);

  const commentsByPost = new Map<string, ConnectComment[]>();
  for (const c of commentRows) {
    const list = commentsByPost.get(c.post_id) ?? [];
    list.push({
      id: c.id,
      postId: c.post_id,
      parentId: c.parent_id,
      author: c.author_id ? (people.get(c.author_id) ?? null) : null,
      body: c.body,
      createdAt: c.created_at,
      editedAt: c.edited_at,
      likeCount: c.likes.length,
      likedByMe: c.likes.some((l) => l.user_id === options.viewerId),
    });
    commentsByPost.set(c.post_id, list);
  }

  const posts = page.map((row): ConnectPost => {
    const group = groupsById.get(row.group_id);
    const role = group?.myRole ?? null;
    const isAuthor = Boolean(row.author_id) && row.author_id === options.viewerId;
    const counts: Partial<Record<ConnectReaction, number>> = {};
    let myReaction: ConnectReaction | null = null;
    for (const r of row.reactions) {
      if (!isConnectReaction(r.reaction)) continue;
      counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
      if (r.user_id === options.viewerId) myReaction = r.reaction;
    }
    const staff = one(row.celebration_staff);

    return {
      id: row.id,
      groupId: row.group_id,
      groupName: group?.name ?? "Group",
      groupColor: group?.color ?? "#818a40",
      author: row.author_id ? (people.get(row.author_id) ?? null) : null,
      body: row.body,
      kind: row.kind,
      celebration:
        row.kind === "celebration" && row.celebration_kind
          ? {
              kind: row.celebration_kind,
              staffName: staff?.full_name ?? "",
              staffPhotoUrl: staff?.photo_url ?? null,
              years: row.celebration_years,
            }
          : null,
      pinnedAt: row.pinned_at,
      editedAt: row.edited_at,
      createdAt: row.created_at,
      attachments: [...row.attachments]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(
          (a): ConnectAttachment => ({
            id: a.id,
            fileUrl: a.file_url,
            contentType: a.content_type,
            originalName: a.original_name,
            fileSize: Number(a.file_size) || 0,
          }),
        ),
      reactionCounts: counts,
      reactionTotal: row.reactions.length,
      myReaction,
      comments: commentsByPost.get(row.id) ?? [],
      canEdit: isAuthor && roleCanPost(role),
      canDelete: isAuthor || roleCanModerate(role),
      canPin: roleCanModerate(role),
      canComment: roleCanInteract(role),
      canModerateComments: roleCanModerate(role),
    };
  });

  return {
    posts,
    nextBefore: hasMore ? (timeline[timeline.length - 1]?.created_at ?? null) : null,
  };
}
