"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  canAccessConnect,
  canAdminConnect,
  effectiveGroupRole,
  roleCanInteract,
  roleCanManageGroup,
  roleCanModerate,
  roleCanPost,
} from "@/lib/connect/permissions";
import {
  markConnectNotificationsRead,
  notifyNewComment,
  notifyNewPost,
  notifyNewReaction,
} from "@/lib/connect/notify";
import { getConnectGroupRow, resolveMemberRole } from "@/lib/connect/store";
import {
  CONNECT_BUCKET,
  CONNECT_GROUP_ICONS,
  CONNECT_MAX_ATTACHMENTS,
  CONNECT_MAX_FILE_BYTES,
  CONNECT_AUTO_MEMBER_ROLES,
  CONNECT_DEPARTMENT_RULE_ROLES,
  CONNECT_MODULE_KEY,
  isConnectGroupRole,
  isConnectReaction,
  type ConnectGroupRole,
} from "@/lib/connect/types";
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

const MAX_POST_CHARS = 5000;
const MAX_COMMENT_CHARS = 2000;

type ConnectActor = {
  userId: string;
  venueId: string;
  isConnectAdmin: boolean;
  service: ReturnType<typeof createServiceClient>;
};

function revalidateConnect() {
  revalidatePath("/connect", "layout");
}

async function requireActor(): Promise<ConnectActor | { error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };
  if (auth.venue.is_global) return { error: "Open Connecteam from a venue." };
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

/** Group (scoped to the actor's venue) and the actor's effective role in it. */
async function resolveGroup(actor: ConnectActor, groupId: string) {
  const group = await getConnectGroupRow(actor.service, actor.venueId, groupId);
  if (!group) return null;
  const memberRole = await resolveMemberRole(actor.service, group, actor.userId);
  return {
    group,
    role: effectiveGroupRole(memberRole, actor.isConnectAdmin),
  };
}

async function loadPost(actor: ConnectActor, postId: string) {
  const { data } = await actor.service
    .from("connect_posts")
    .select("id, group_id, author_id, pinned_at")
    .eq("id", postId)
    .eq("venue_id", actor.venueId)
    .maybeSingle();
  if (!data) return null;
  const resolved = await resolveGroup(actor, data.group_id as string);
  if (!resolved) return null;
  return {
    post: data as {
      id: string;
      group_id: string;
      author_id: string | null;
      pinned_at: string | null;
    },
    group: resolved.group,
    role: resolved.role,
    archived: Boolean(resolved.group.archived_at),
  };
}

function isImageUpload(type: string, name: string): boolean {
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?)$/i.test(name);
}

function safeExtension(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match ? match[1]!.toLowerCase() : "bin";
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function createConnectPost(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const groupId = String(formData.get("groupId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const celebrationStaffId =
    String(formData.get("celebrationStaffId") ?? "").trim() || null;
  const celebrationKindRaw = String(formData.get("celebrationKind") ?? "").trim();
  const celebrationYearsRaw = Number(formData.get("celebrationYears") ?? "");
  const files = formData
    .getAll("files")
    .map((f) => asUploadBlob(f))
    .filter((f): f is NonNullable<typeof f> => Boolean(f && f.size > 0));

  if (!groupId) return fail("Choose a group to post in.");
  if (!body && files.length === 0 && !celebrationStaffId) {
    return fail("Write something or add a photo or file.");
  }
  if (body.length > MAX_POST_CHARS) {
    return fail(`Posts can be up to ${MAX_POST_CHARS} characters.`);
  }
  if (files.length > CONNECT_MAX_ATTACHMENTS) {
    return fail(`Attach up to ${CONNECT_MAX_ATTACHMENTS} files per post.`);
  }
  if (files.some((f) => f.size > CONNECT_MAX_FILE_BYTES)) {
    return fail("Each file must be 25 MB or smaller.");
  }

  const resolved = await resolveGroup(actor, groupId);
  if (!resolved || resolved.group.archived_at) return fail("That group is not available.");
  if (!roleCanPost(resolved.role)) {
    return fail("You can comment and react in this group, but not start posts.");
  }

  let celebrationKind: "birthday" | "anniversary" | "shoutout" | null = null;
  if (celebrationStaffId) {
    if (
      celebrationKindRaw !== "birthday" &&
      celebrationKindRaw !== "anniversary" &&
      celebrationKindRaw !== "shoutout"
    ) {
      return fail("Choose what you are celebrating.");
    }
    celebrationKind = celebrationKindRaw;
    const { data: staff } = await actor.service
      .from("staff")
      .select("id")
      .eq("id", celebrationStaffId)
      .eq("home_venue_id", actor.venueId)
      .maybeSingle();
    if (!staff) return fail("That team member was not found.");
  }

  const postId = randomUUID();
  const uploaded: string[] = [];
  const attachmentRows: Record<string, unknown>[] = [];

  for (const [index, blob] of files.entries()) {
    const meta = uploadBlobMeta(blob);
    const bytes = Buffer.from(await blob.arrayBuffer());
    let buffer: Buffer = bytes;
    let contentType = meta.type || "application/octet-stream";
    let extension = safeExtension(meta.name);

    // Photos become resized WebP; animated GIFs and SVGs stay as uploaded.
    if (
      isImageUpload(meta.type, meta.name) &&
      !/gif$/i.test(meta.type) &&
      !shouldSkipWebpConversion(meta.type, extension)
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

    const storagePath = `${actor.venueId}/${postId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await actor.service.storage
      .from(CONNECT_BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: false });
    if (uploadError) {
      if (uploaded.length) {
        await actor.service.storage.from(CONNECT_BUCKET).remove(uploaded);
      }
      return fail(`Couldn't upload ${meta.name || "a file"}: ${uploadError.message}`);
    }
    uploaded.push(storagePath);

    const { data: publicUrl } = actor.service.storage
      .from(CONNECT_BUCKET)
      .getPublicUrl(storagePath);

    attachmentRows.push({
      venue_id: actor.venueId,
      post_id: postId,
      storage_path: storagePath,
      file_url: publicUrl.publicUrl,
      content_type: contentType,
      original_name: meta.name || `file.${extension}`,
      file_size: buffer.length,
      sort_order: index,
    });
  }

  const { error: insertError } = await actor.service.from("connect_posts").insert({
    id: postId,
    venue_id: actor.venueId,
    group_id: groupId,
    author_id: actor.userId,
    body,
    kind: celebrationStaffId ? "celebration" : "post",
    celebration_staff_id: celebrationStaffId,
    celebration_kind: celebrationKind,
    celebration_years:
      celebrationKind === "anniversary" && Number.isFinite(celebrationYearsRaw)
        ? Math.max(1, Math.round(celebrationYearsRaw))
        : null,
  });

  if (insertError) {
    if (uploaded.length) await actor.service.storage.from(CONNECT_BUCKET).remove(uploaded);
    return fail(insertError.message);
  }

  if (attachmentRows.length) {
    const { error: attachError } = await actor.service
      .from("connect_post_attachments")
      .insert(attachmentRows);
    if (attachError) {
      await actor.service.from("connect_posts").delete().eq("id", postId);
      await actor.service.storage.from(CONNECT_BUCKET).remove(uploaded);
      return fail(attachError.message);
    }
  }

  const group = resolved.group;
  after(() =>
    notifyNewPost(actor.service, {
      group,
      postId,
      authorId: actor.userId,
      body,
      hasFiles: attachmentRows.length > 0,
    }),
  );

  revalidateConnect();
  return { ok: true, id: postId };
}

export async function updateConnectPost(
  postId: string,
  body: string,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const text = body.trim();
  if (text.length > MAX_POST_CHARS) {
    return fail(`Posts can be up to ${MAX_POST_CHARS} characters.`);
  }

  const loaded = await loadPost(actor, postId);
  if (!loaded) return fail("Post not found.");
  if (loaded.post.author_id !== actor.userId || !roleCanPost(loaded.role)) {
    return fail("Only the author can edit this post.");
  }

  const { error } = await actor.service
    .from("connect_posts")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) return fail(error.message);

  revalidateConnect();
  return { ok: true };
}

export async function deleteConnectPost(postId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const loaded = await loadPost(actor, postId);
  if (!loaded) return fail("Post not found.");
  const isAuthor = loaded.post.author_id === actor.userId;
  if (!isAuthor && !roleCanModerate(loaded.role)) {
    return fail("You can't remove this post.");
  }

  const { data: attachments } = await actor.service
    .from("connect_post_attachments")
    .select("storage_path")
    .eq("post_id", postId);

  const { error } = await actor.service.from("connect_posts").delete().eq("id", postId);
  if (error) return fail(error.message);

  const paths = (attachments ?? []).map((a) => a.storage_path as string);
  if (paths.length) await actor.service.storage.from(CONNECT_BUCKET).remove(paths);

  if (!isAuthor) {
    await writeAuditLog({
      actor_id: actor.userId,
      action: "connect.post.remove",
      module_key: CONNECT_MODULE_KEY,
      entity: "connect_posts",
      entity_id: postId,
      venue_id: actor.venueId,
      before: { author_id: loaded.post.author_id, group_id: loaded.post.group_id },
    });
  }

  revalidateConnect();
  return { ok: true };
}

export async function toggleConnectPostPin(postId: string): Promise<Result<{ pinned: boolean }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const loaded = await loadPost(actor, postId);
  if (!loaded) return fail("Post not found.");
  if (!roleCanModerate(loaded.role)) return fail("Only group moderators can pin posts.");

  const pinned = !loaded.post.pinned_at;
  const { error } = await actor.service
    .from("connect_posts")
    .update({
      pinned_at: pinned ? new Date().toISOString() : null,
      pinned_by: pinned ? actor.userId : null,
    })
    .eq("id", postId);
  if (error) return fail(error.message);

  revalidateConnect();
  return { ok: true, pinned };
}

export async function setConnectPostReaction(
  postId: string,
  reaction: string | null,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const loaded = await loadPost(actor, postId);
  if (!loaded || !roleCanInteract(loaded.role)) return fail("Post not found.");

  if (reaction === null) {
    const { error } = await actor.service
      .from("connect_post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", actor.userId);
    if (error) return fail(error.message);
  } else {
    if (!isConnectReaction(reaction)) return fail("Unknown reaction.");
    const { error } = await actor.service.from("connect_post_reactions").upsert(
      {
        post_id: postId,
        user_id: actor.userId,
        venue_id: actor.venueId,
        reaction,
      },
      { onConflict: "post_id,user_id" },
    );
    if (error) return fail(error.message);
    after(() =>
      notifyNewReaction(actor.service, {
        group: loaded.group,
        postId,
        target: { kind: "post", id: postId, authorId: loaded.post.author_id },
        reactorId: actor.userId,
        reaction,
      }),
    );
  }

  revalidateConnect();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addConnectComment(
  postId: string,
  body: string,
  parentId: string | null = null,
): Promise<Result<{ id: string }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const text = body.trim();
  if (!text) return fail("Write a comment first.");
  if (text.length > MAX_COMMENT_CHARS) {
    return fail(`Comments can be up to ${MAX_COMMENT_CHARS} characters.`);
  }

  const loaded = await loadPost(actor, postId);
  if (!loaded || !roleCanInteract(loaded.role)) return fail("Post not found.");
  if (loaded.archived) return fail("This group is archived.");

  let threadParent: string | null = null;
  if (parentId) {
    const { data: parent } = await actor.service
      .from("connect_comments")
      .select("id, parent_id")
      .eq("id", parentId)
      .eq("post_id", postId)
      .maybeSingle();
    if (!parent) return fail("That comment was removed.");
    // Replies stay one level deep: replying to a reply joins its thread.
    threadParent = (parent.parent_id as string | null) ?? (parent.id as string);
  }

  const { data, error } = await actor.service
    .from("connect_comments")
    .insert({
      venue_id: actor.venueId,
      post_id: postId,
      parent_id: threadParent,
      author_id: actor.userId,
      body: text,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  const commentId = data.id as string;
  after(() =>
    notifyNewComment(actor.service, {
      group: loaded.group,
      postId,
      postAuthorId: loaded.post.author_id,
      commentId,
      commenterId: actor.userId,
      body: text,
    }),
  );

  revalidateConnect();
  return { ok: true, id: commentId };
}

export async function deleteConnectComment(commentId: string): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const { data: comment } = await actor.service
    .from("connect_comments")
    .select("id, post_id, author_id")
    .eq("id", commentId)
    .eq("venue_id", actor.venueId)
    .maybeSingle();
  if (!comment) return fail("Comment not found.");

  const loaded = await loadPost(actor, comment.post_id as string);
  if (!loaded) return fail("Comment not found.");
  const isAuthor = comment.author_id === actor.userId;
  if (!isAuthor && !roleCanModerate(loaded.role)) {
    return fail("You can't remove this comment.");
  }

  const { error } = await actor.service.from("connect_comments").delete().eq("id", commentId);
  if (error) return fail(error.message);

  revalidateConnect();
  return { ok: true };
}

export async function toggleConnectCommentLike(
  commentId: string,
): Promise<Result<{ liked: boolean }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const { data: comment } = await actor.service
    .from("connect_comments")
    .select("id, post_id, author_id")
    .eq("id", commentId)
    .eq("venue_id", actor.venueId)
    .maybeSingle();
  if (!comment) return fail("Comment not found.");
  const loaded = await loadPost(actor, comment.post_id as string);
  if (!loaded || !roleCanInteract(loaded.role)) return fail("Comment not found.");

  const { data: existing } = await actor.service
    .from("connect_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const { error } = existing
    ? await actor.service
        .from("connect_comment_likes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", actor.userId)
    : await actor.service.from("connect_comment_likes").insert({
        comment_id: commentId,
        user_id: actor.userId,
        venue_id: actor.venueId,
      });
  if (error) return fail(error.message);

  if (!existing) {
    after(() =>
      notifyNewReaction(actor.service, {
        group: loaded.group,
        postId: comment.post_id as string,
        target: {
          kind: "comment",
          id: commentId,
          authorId: (comment.author_id as string | null) ?? null,
        },
        reactorId: actor.userId,
        reaction: "like",
      }),
    );
  }

  revalidateConnect();
  return { ok: true, liked: !existing };
}

// ---------------------------------------------------------------------------
// Groups & members
// ---------------------------------------------------------------------------

export type SaveConnectGroupInput = {
  id?: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
};

export async function saveConnectGroup(
  input: SaveConnectGroupInput,
): Promise<Result<{ id: string }>> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const name = input.name.trim().slice(0, 60);
  const description = input.description.trim().slice(0, 300);
  const icon = (CONNECT_GROUP_ICONS as readonly string[]).includes(input.icon)
    ? input.icon
    : "users";
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : "#818a40";
  if (!name) return fail("Give the group a name.");

  if (input.id) {
    const resolved = await resolveGroup(actor, input.id);
    if (!resolved) return fail("Group not found.");
    if (!roleCanManageGroup(resolved.role)) return fail("Only group admins can edit this group.");
    const { error } = await actor.service
      .from("connect_groups")
      .update({ name, description, icon, color })
      .eq("id", input.id);
    if (error) {
      return fail(error.code === "23505" ? "A group with that name already exists." : error.message);
    }
    revalidateConnect();
    return { ok: true, id: input.id };
  }

  if (!actor.isConnectAdmin) return fail("Only Connecteam admins can create groups.");

  const { data: last } = await actor.service
    .from("connect_groups")
    .select("sort_order")
    .eq("venue_id", actor.venueId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await actor.service
    .from("connect_groups")
    .insert({
      venue_id: actor.venueId,
      name,
      description,
      icon,
      color,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error) {
    return fail(error.code === "23505" ? "A group with that name already exists." : error.message);
  }

  await writeAuditLog({
    actor_id: actor.userId,
    action: "connect.group.create",
    module_key: CONNECT_MODULE_KEY,
    entity: "connect_groups",
    entity_id: data.id as string,
    venue_id: actor.venueId,
    after: { name },
  });

  revalidateConnect();
  return { ok: true, id: data.id as string };
}

export async function setConnectGroupArchived(
  groupId: string,
  archived: boolean,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  if (!actor.isConnectAdmin) return fail("Only Connecteam admins can archive groups.");

  const group = await getConnectGroupRow(actor.service, actor.venueId, groupId);
  if (!group) return fail("Group not found.");

  const { error } = await actor.service
    .from("connect_groups")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", groupId);
  if (error) return fail(error.message);

  revalidateConnect();
  return { ok: true };
}

/** Add members or change their role. Pass `role: null` to remove them. */
export async function setConnectGroupMembers(
  groupId: string,
  userIds: string[],
  role: ConnectGroupRole | null,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  if (role !== null && !isConnectGroupRole(role)) return fail("Unknown role.");

  const resolved = await resolveGroup(actor, groupId);
  if (!resolved) return fail("Group not found.");
  if (!roleCanManageGroup(resolved.role)) {
    return fail("Only group admins can manage members.");
  }

  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };

  if (role === null) {
    const { error } = await actor.service
      .from("connect_group_members")
      .delete()
      .eq("group_id", groupId)
      .in("user_id", ids);
    if (error) return fail(error.message);
  } else {
    const { error } = await actor.service.from("connect_group_members").upsert(
      ids.map((userId) => ({
        group_id: groupId,
        user_id: userId,
        venue_id: actor.venueId,
        role,
        added_by: actor.userId,
      })),
      { onConflict: "group_id,user_id" },
    );
    if (error) return fail(error.message);
  }

  await writeAuditLog({
    actor_id: actor.userId,
    action: role ? "connect.group.members.set" : "connect.group.members.remove",
    module_key: CONNECT_MODULE_KEY,
    entity: "connect_group_members",
    entity_id: groupId,
    venue_id: actor.venueId,
    after: { user_ids: ids, role },
  });

  revalidateConnect();
  return { ok: true };
}

export type SaveConnectMembershipRulesInput = {
  groupId: string;
  /** Everyone with Hub access at the venue joins at this role; null = off. */
  everyoneRole: string | null;
  departments: { departmentId: string; role: string }[];
};

/** Group setup: automatic membership for everyone and by HR department. */
export async function saveConnectMembershipRules(
  input: SaveConnectMembershipRulesInput,
): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);

  const resolved = await resolveGroup(actor, input.groupId);
  if (!resolved) return fail("Group not found.");
  if (!roleCanManageGroup(resolved.role)) {
    return fail("Only group admins can change membership rules.");
  }

  const everyoneRole =
    input.everyoneRole &&
    (CONNECT_AUTO_MEMBER_ROLES as readonly string[]).includes(input.everyoneRole)
      ? input.everyoneRole
      : null;

  const seen = new Set<string>();
  const departments: { departmentId: string; role: string }[] = [];
  for (const d of input.departments) {
    if (!d.departmentId || seen.has(d.departmentId)) continue;
    if (!(CONNECT_DEPARTMENT_RULE_ROLES as readonly string[]).includes(d.role)) {
      return fail("Choose a role for each department.");
    }
    seen.add(d.departmentId);
    departments.push(d);
  }

  if (departments.length) {
    const { data: valid } = await actor.service
      .from("departments")
      .select("id")
      .eq("venue_id", actor.venueId)
      .in(
        "id",
        departments.map((d) => d.departmentId),
      );
    if ((valid ?? []).length !== departments.length) {
      return fail("One of the departments was not found at this venue.");
    }
  }

  const { error: groupError } = await actor.service
    .from("connect_groups")
    .update({ auto_member_role: everyoneRole })
    .eq("id", input.groupId);
  if (groupError) return fail(groupError.message);

  const { error: clearError } = await actor.service
    .from("connect_group_department_rules")
    .delete()
    .eq("group_id", input.groupId);
  if (clearError) return fail(clearError.message);

  if (departments.length) {
    const { error: insertError } = await actor.service
      .from("connect_group_department_rules")
      .insert(
        departments.map((d) => ({
          group_id: input.groupId,
          department_id: d.departmentId,
          venue_id: actor.venueId,
          role: d.role,
          created_by: actor.userId,
        })),
      );
    if (insertError) return fail(insertError.message);
  }

  await writeAuditLog({
    actor_id: actor.userId,
    action: "connect.group.membership_rules",
    module_key: CONNECT_MODULE_KEY,
    entity: "connect_groups",
    entity_id: input.groupId,
    venue_id: actor.venueId,
    after: { everyone_role: everyoneRole, departments },
  });

  revalidateConnect();
  return { ok: true };
}

/** Clears Connecteam notifications (and the app badge) once the feed is seen. */
export async function markConnectSeen(groupId: string | null = null): Promise<Result> {
  const actor = await requireActor();
  if ("error" in actor) return fail(actor.error);
  await markConnectNotificationsRead(actor.service, {
    userId: actor.userId,
    venueId: actor.venueId,
    groupId,
  });
  return { ok: true };
}
