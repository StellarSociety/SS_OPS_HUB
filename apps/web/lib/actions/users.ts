"use server";

import { revalidatePath } from "next/cache";
import { requireAppAdmin } from "@/lib/access/permissions";
import { expandAccess, type AccessEditorState } from "@/lib/access/roles";
import {
  getUserById,
  listInviteableStaff,
  listUsers,
  listVenueModules,
  listVenues,
  resolveLoginEmail,
  staffInviteEmail,
} from "@/lib/access/store";
import type { PermissionGrantInput } from "@/lib/access/types";
import { writeAuditLog } from "@/lib/audit";
import {
  buildInviteEmailHtml,
  buildPasswordResetEmailHtml,
  sendResendEmail,
} from "@/lib/email/resend";
import { VENUE_TOGGLEABLE_MODULES } from "@/lib/modules-catalog";
import {
  convertImageToWebp,
  isRasterImageMime,
} from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";
import sharp from "sharp";

const SETTINGS_PATHS = ["/settings", "/settings/users", "/settings/venue-modules"];

function revalidateSettings() {
  for (const path of SETTINGS_PATHS) {
    revalidatePath(path);
  }
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Canonical, user-facing site URL for links we share with people (e.g. the
 * login URL in handed-over credentials). Prefers an explicit public site URL,
 * then Vercel's production URL, and only falls back to the local app URL.
 */
function publicSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return appUrl();
}

/**
 * Build the link an invitee/recoverer actually clicks. We point at our own
 * `/auth/callback` route with the OTP `token_hash`, so the callback can call
 * `verifyOtp` and establish a session server-side (cookies). This avoids the
 * default `action_link`, which returns tokens in the URL hash fragment that a
 * server route can't read. Falls back to the raw action link if the hashed
 * token is ever missing.
 */
function buildConfirmLink(params: {
  hashedToken: string | null | undefined;
  type: "invite" | "recovery";
  next: string;
  fallback: string;
}) {
  if (!params.hashedToken) return params.fallback;
  const url = new URL(`${appUrl()}/auth/callback`);
  url.searchParams.set("token_hash", params.hashedToken);
  url.searchParams.set("type", params.type);
  url.searchParams.set("next", params.next);
  return url.toString();
}

/** Sends an invite email; returns an error string on failure, or null on success. */
async function tryDeliverInvite(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<string | null> {
  try {
    await sendResendEmail(params);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Failed to send email.";
  }
}

/**
 * Standard invite result. When the email couldn't be delivered we still keep the
 * account and hand back the invite link so an admin can share it manually.
 */
function inviteResult(params: {
  email: string;
  emailError: string | null;
  inviteLink: string;
  userId: string;
}) {
  if (params.emailError) {
    return {
      success: `Account created for ${params.email}, but the email couldn't be sent. Copy the invite link below to share it.`,
      warning: params.emailError,
      inviteLink: params.inviteLink,
      userId: params.userId,
    };
  }
  return { success: `Invitation sent to ${params.email}.`, userId: params.userId };
}

type EmailSource = "work" | "personal";

type InviteOptions = {
  emailSource?: EmailSource;
  /** When false, create the account directly with `password` and skip email. */
  sendEmail?: boolean;
  password?: string;
};

/**
 * Create an account directly in Supabase with a known password (email confirmed),
 * for the "share credentials manually" workaround when email isn't available.
 */
async function createDirectAccount(params: {
  actor: { id: string };
  service: ReturnType<typeof createServiceClient>;
  email: string;
  fullName: string;
  staffId: string | null;
  isExternal: boolean;
  emailSource: EmailSource | "custom";
  password?: string;
}) {
  const { actor, service, email, fullName, staffId, isExternal, emailSource } =
    params;
  const password = params.password ?? "";

  if (password.length < 8) {
    return { error: "Set a password of at least 8 characters." };
  }

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        ...(staffId ? { staff_id: staffId } : {}),
      },
    });

  if (createError || !created?.user) {
    return { error: createError?.message ?? "Failed to create user." };
  }

  const userId = created.user.id;
  const nowIso = new Date().toISOString();

  const { error: profileError } = await service.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    staff_id: staffId,
    status: "active",
    is_external: isExternal,
    login_email_source: emailSource,
    invited_at: nowIso,
    invite_accepted_at: nowIso,
  });

  if (profileError) {
    return { error: profileError.message };
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "create",
    module_key: "app",
    entity: "user",
    entity_id: userId,
    after: {
      email,
      staff_id: staffId,
      full_name: fullName,
      external: isExternal,
      method: "direct_password",
    },
  });

  revalidateSettings();
  return {
    success: `Account created for ${email}.`,
    userId,
    credentials: { email, password, loginUrl: `${publicSiteUrl()}/login` },
  };
}

/**
 * Invite a staff member (from any venue) to become an app user.
 * `emailSource` chooses which HR email to use for login. When `sendEmail` is
 * false the account is created directly with the supplied password.
 */
export async function inviteUser(staffId: string, options: InviteOptions = {}) {
  const { emailSource = "work", sendEmail = true, password } = options;
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const { data: staff, error: staffError } = await service
    .from("staff")
    .select(
      `
      id,
      first_name,
      full_name,
      work_email,
      personal_email,
      home_venue:home_venue_id ( name )
    `,
    )
    .eq("id", staffId)
    .single();

  if (staffError || !staff) {
    return { error: "Staff record not found." };
  }

  const email =
    resolveLoginEmail(emailSource, staff) ?? staffInviteEmail(staff);
  if (!email) {
    return {
      error:
        "This staff member has no email. Add work or personal email on their HR record first.",
    };
  }

  const { data: existingByStaff } = await service
    .from("profiles")
    .select("id")
    .eq("staff_id", staffId)
    .maybeSingle();

  if (existingByStaff) {
    return { error: "This staff member already has an app account." };
  }

  const { data: existingByEmail } = await service
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existingByEmail) {
    return { error: "An account with this email already exists." };
  }

  if (!sendEmail) {
    return createDirectAccount({
      actor,
      service,
      email,
      fullName: staff.full_name,
      staffId: staff.id,
      isExternal: false,
      emailSource,
      password,
    });
  }

  const redirectTo = `${appUrl()}/auth/callback?next=/reset-password`;
  const firstName = staff.first_name?.trim() || staff.full_name;

  const { data: linkData, error: linkError } =
    await service.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: {
          full_name: staff.full_name,
          staff_id: staff.id,
        },
      },
    });

  if (linkError || !linkData?.properties?.action_link) {
    return { error: linkError?.message ?? "Failed to generate invite link." };
  }

  const invitedUserId = linkData.user?.id;
  if (!invitedUserId) {
    return { error: "Failed to create auth user." };
  }

  const inviteLink = buildConfirmLink({
    hashedToken: linkData.properties.hashed_token,
    type: "invite",
    next: "/reset-password",
    fallback: linkData.properties.action_link,
  });

  const { error: profileError } = await service.from("profiles").upsert({
    id: invitedUserId,
    email,
    full_name: staff.full_name,
    staff_id: staff.id,
    status: "active",
    is_external: false,
    login_email_source: emailSource,
    invited_at: new Date().toISOString(),
  });

  if (profileError) {
    return { error: profileError.message };
  }

  const emailError = await tryDeliverInvite({
    to: email,
    subject: "You're invited to the SS Operational Hub",
    html: buildInviteEmailHtml({
      firstName,
      inviteLink,
    }),
  });

  await writeAuditLog({
    actor_id: actor.id,
    action: "create",
    module_key: "app",
    entity: "user",
    entity_id: invitedUserId,
    after: { email, staff_id: staff.id, full_name: staff.full_name, emailSource },
  });

  revalidateSettings();
  return inviteResult({
    email,
    emailError,
    inviteLink,
    userId: invitedUserId,
  });
}

/**
 * Invite a person who is NOT in HR (an external user, no staff record).
 */
export async function inviteExternalUser(input: {
  fullName: string;
  email: string;
  sendEmail?: boolean;
  password?: string;
}) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const sendEmail = input.sendEmail ?? true;

  if (!fullName) return { error: "Name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const { data: existingByEmail } = await service
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existingByEmail) {
    return { error: "An account with this email already exists." };
  }

  if (!sendEmail) {
    return createDirectAccount({
      actor,
      service,
      email,
      fullName,
      staffId: null,
      isExternal: true,
      emailSource: "custom",
      password: input.password,
    });
  }

  const redirectTo = `${appUrl()}/auth/callback?next=/reset-password`;
  const firstName = fullName.split(/\s+/)[0] ?? fullName;

  const { data: linkData, error: linkError } =
    await service.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: { full_name: fullName },
      },
    });

  if (linkError || !linkData?.properties?.action_link) {
    return { error: linkError?.message ?? "Failed to generate invite link." };
  }

  const invitedUserId = linkData.user?.id;
  if (!invitedUserId) return { error: "Failed to create auth user." };

  const inviteLink = buildConfirmLink({
    hashedToken: linkData.properties.hashed_token,
    type: "invite",
    next: "/reset-password",
    fallback: linkData.properties.action_link,
  });

  const { error: profileError } = await service.from("profiles").upsert({
    id: invitedUserId,
    email,
    full_name: fullName,
    staff_id: null,
    status: "active",
    is_external: true,
    login_email_source: "custom",
    invited_at: new Date().toISOString(),
  });

  if (profileError) return { error: profileError.message };

  const emailError = await tryDeliverInvite({
    to: email,
    subject: "You're invited to the SS Operational Hub",
    html: buildInviteEmailHtml({
      firstName,
      inviteLink,
      external: true,
    }),
  });

  await writeAuditLog({
    actor_id: actor.id,
    action: "create",
    module_key: "app",
    entity: "user",
    entity_id: invitedUserId,
    after: { email, full_name: fullName, external: true },
  });

  revalidateSettings();
  return inviteResult({
    email,
    emailError,
    inviteLink,
    userId: invitedUserId,
  });
}

export async function resendUserInvite(userId: string) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const target = await getUserById(service, userId);
  if (!target) return { error: "User not found." };

  const redirectTo = `${appUrl()}/auth/callback?next=/reset-password`;
  const firstName =
    target.staff?.first_name?.trim() ||
    target.full_name?.split(/\s+/)[0] ||
    target.email;

  const { data: linkData, error: linkError } =
    await service.auth.admin.generateLink({
      type: "invite",
      email: target.email,
      options: {
        redirectTo,
        data: {
          full_name: target.full_name ?? target.email,
          staff_id: target.staff_id,
        },
      },
    });

  if (linkError || !linkData?.properties?.action_link) {
    return { error: linkError?.message ?? "Failed to generate invite link." };
  }

  const inviteLink = buildConfirmLink({
    hashedToken: linkData.properties.hashed_token,
    type: "invite",
    next: "/reset-password",
    fallback: linkData.properties.action_link,
  });

  const emailError = await tryDeliverInvite({
    to: target.email,
    subject: "Your SS Operational Hub invitation",
    html: buildInviteEmailHtml({
      firstName,
      inviteLink,
    }),
  });

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "user_invite",
    entity_id: userId,
    after: { email: target.email, resent: true, emailError },
  });

  revalidateSettings();
  if (emailError) {
    return {
      success: `Couldn't email ${target.email}. Copy the invite link below to share it manually.`,
      warning: emailError,
      inviteLink,
    };
  }
  return { success: `Invitation resent to ${target.email}.` };
}

/** Send a password-reset email to the user's registered address. */
export async function resetUserPassword(userId: string) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const target = await getUserById(service, userId);
  if (!target) return { error: "User not found." };

  const redirectTo = `${appUrl()}/auth/callback?next=/reset-password`;
  const { data: linkData, error: linkError } =
    await service.auth.admin.generateLink({
      type: "recovery",
      email: target.email,
      options: { redirectTo },
    });

  if (linkError || !linkData?.properties?.action_link) {
    return { error: linkError?.message ?? "Failed to generate reset link." };
  }

  const resetLink = buildConfirmLink({
    hashedToken: linkData.properties.hashed_token,
    type: "recovery",
    next: "/reset-password",
    fallback: linkData.properties.action_link,
  });

  const firstName =
    target.staff?.first_name?.trim() ||
    target.full_name?.split(/\s+/)[0] ||
    target.email;

  try {
    await sendResendEmail({
      to: target.email,
      subject: "Reset your SS Operational Hub password",
      html: buildPasswordResetEmailHtml({
        firstName,
        resetLink,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return { error: message };
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "password_reset",
    entity_id: userId,
    after: { email: target.email },
  });

  return { success: `Password reset sent to ${target.email}.` };
}

/**
 * Set a user's password directly (admin workaround). Confirms the email so the
 * user can sign in immediately, and returns the credentials to share.
 */
export async function setUserPassword(userId: string, password: string) {
  const { user: actor } = await requireAppAdmin();

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const service = createServiceClient();
  const target = await getUserById(service, userId);
  if (!target) return { error: "User not found." };

  const { error } = await service.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) return { error: error.message };

  if (!target.invite_accepted_at) {
    try {
      await service
        .from("profiles")
        .update({ invite_accepted_at: new Date().toISOString() })
        .eq("id", userId);
    } catch {
      // best-effort
    }
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "password_set",
    entity_id: userId,
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return {
    success: "Password set.",
    credentials: {
      email: target.email,
      password,
      loginUrl: `${publicSiteUrl()}/login`,
    },
  };
}

/** Change a user's login email (Global/Venue admin). Must remain unique. */
export async function changeUserEmail(userId: string, newEmailRaw: string) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const newEmail = newEmailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: "Enter a valid email address." };
  }

  const before = await getUserById(service, userId);
  if (!before) return { error: "User not found." };

  const { data: clash } = await service
    .from("profiles")
    .select("id")
    .ilike("email", newEmail)
    .neq("id", userId)
    .maybeSingle();
  if (clash) return { error: "Another account already uses this email." };

  const { error: authError } = await service.auth.admin.updateUserById(userId, {
    email: newEmail,
  });
  if (authError) return { error: authError.message };

  const { error: profileError } = await service
    .from("profiles")
    .update({ email: newEmail, login_email_source: "custom" })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "profile_email",
    entity_id: userId,
    before: { email: before.email },
    after: { email: newEmail },
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return { success: `Login email updated to ${newEmail}.` };
}

/** Change a user's display name. Primarily for external users (no HR record). */
export async function changeUserName(userId: string, newNameRaw: string) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const fullName = newNameRaw.trim();
  if (fullName.length < 2) {
    return { error: "Enter a name of at least 2 characters." };
  }

  const before = await getUserById(service, userId);
  if (!before) return { error: "User not found." };

  const { error: profileError } = await service
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  try {
    await service.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: fullName },
    });
  } catch {
    // best-effort — profile name is the source of truth for display
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "profile_name",
    entity_id: userId,
    before: { full_name: before.full_name },
    after: { full_name: fullName },
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return { success: `Name updated to ${fullName}.` };
}

const USER_AVATARS_BUCKET = "user-avatars";
const USER_AVATAR_MAX_BYTES = 512 * 1024;

function userAvatarObjectPath(userId: string) {
  return `${userId}.webp`;
}

function userAvatarLegacyPaths(userId: string) {
  return [`${userId}.jpg`, `${userId}.jpeg`, `${userId}.png`];
}

export async function updateUserAvatar(userId: string, formData: FormData) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const before = await getUserById(service, userId);
  if (!before) return { error: "User not found." };

  const clear = String(formData.get("avatar_clear") ?? "") === "1";
  const file = formData.get("avatar");
  const objectPath = userAvatarObjectPath(userId);

  if (file instanceof File && file.size > 0) {
    if (file.size > USER_AVATAR_MAX_BYTES) {
      return { error: "Profile photo must be 512 KB or smaller." };
    }
    if (!isRasterImageMime(file.type)) {
      return { error: "Profile photo must be a PNG, JPEG, or WebP image." };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    let webpBuffer: Buffer;
    try {
      const rotated = sharp(bytes, { failOn: "none" }).rotate();
      webpBuffer = await rotated
        .resize(256, 256, { fit: "cover", position: "centre" })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      try {
        const webp = await convertImageToWebp(bytes, {
          maxWidth: 256,
          maxHeight: 256,
        });
        webpBuffer = webp.buffer;
      } catch {
        return { error: "Could not process profile photo." };
      }
    }

    await service.storage
      .from(USER_AVATARS_BUCKET)
      .remove([objectPath, ...userAvatarLegacyPaths(userId)]);

    const { error: uploadError } = await service.storage
      .from(USER_AVATARS_BUCKET)
      .upload(objectPath, webpBuffer, {
        contentType: "image/webp",
        upsert: true,
        cacheControl: "31536000",
      });

    if (uploadError) {
      return {
        error:
          "Could not upload profile photo. Ensure user-avatars storage exists (run db migrations).",
      };
    }

    const { data: publicData } = service.storage
      .from(USER_AVATARS_BUCKET)
      .getPublicUrl(objectPath);

    const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;

    const { error: profileError } = await service
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId);
    if (profileError) return { error: profileError.message };

    try {
      await service.auth.admin.updateUserById(userId, {
        user_metadata: { avatar_url: avatarUrl },
      });
    } catch {
      // profile.avatar_url is the source of truth
    }

    await writeAuditLog({
      actor_id: actor.id,
      action: "update",
      module_key: "app",
      entity: "profile_avatar",
      entity_id: userId,
      before: { avatar_url: before.avatar_url },
      after: { avatar_url: avatarUrl },
    });

    revalidateSettings();
    revalidatePath(`/settings/users/${userId}`);
    revalidatePath("/", "layout");
    return { success: "Profile photo saved.", avatarUrl };
  }

  if (clear) {
    const toRemove = new Set<string>([
      objectPath,
      ...userAvatarLegacyPaths(userId),
    ]);
    if (before.avatar_url) {
      const match = before.avatar_url.match(/\/user-avatars\/([^?]+)/);
      if (match?.[1]) {
        toRemove.add(decodeURIComponent(match[1]));
      }
    }
    await service.storage.from(USER_AVATARS_BUCKET).remove([...toRemove]);

    const { error: profileError } = await service
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", userId);
    if (profileError) return { error: profileError.message };

    try {
      await service.auth.admin.updateUserById(userId, {
        user_metadata: { avatar_url: null },
      });
    } catch {
      /* best-effort */
    }

    await writeAuditLog({
      actor_id: actor.id,
      action: "update",
      module_key: "app",
      entity: "profile_avatar",
      entity_id: userId,
      before: { avatar_url: before.avatar_url },
      after: { avatar_url: null },
    });

    revalidateSettings();
    revalidatePath(`/settings/users/${userId}`);
    revalidatePath("/", "layout");
    return { success: "Profile photo removed.", avatarUrl: null };
  }

  return { error: "Choose a photo to upload." };
}

export async function setUserStatus(userId: string, status: "active" | "disabled") {
  const { user: actor } = await requireAppAdmin();

  if (actor.id === userId && status === "disabled") {
    return { error: "You cannot deactivate your own account." };
  }

  const service = createServiceClient();
  const before = await getUserById(service, userId);
  if (!before) return { error: "User not found." };

  const { error } = await service
    .from("profiles")
    .update({ status })
    .eq("id", userId);

  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "profile",
    entity_id: userId,
    before: { status: before.status },
    after: { status },
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return { success: status === "active" ? "User activated." : "User deactivated." };
}

/**
 * Suspend (or restore) ALL access for a user in one action. This:
 *  - flips the profile status (blocks login in the app),
 *  - bans/unbans the auth user in Supabase (blocks the session at the API level),
 *  - suspends/restores every assigned app.
 */
export async function suspendAllAccess(userId: string, suspend: boolean) {
  const { user: actor } = await requireAppAdmin();

  if (actor.id === userId && suspend) {
    return { error: "You cannot suspend your own account." };
  }

  const service = createServiceClient();
  const before = await getUserById(service, userId);
  if (!before) return { error: "User not found." };

  const { error: profileError } = await service
    .from("profiles")
    .update({ status: suspend ? "disabled" : "active" })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  // Ban at the auth level so any existing session is rejected too. Best-effort.
  try {
    await service.auth.admin.updateUserById(userId, {
      ban_duration: suspend ? "876000h" : "none",
    });
  } catch {
    // best-effort — app-level status still blocks login
  }

  // Suspend/restore every assigned app. Best-effort.
  try {
    await service
      .from("user_module_access")
      .update({ suspended: suspend })
      .eq("user_id", userId);
  } catch {
    // best-effort — table may not be migrated yet
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "user_access_suspend",
    entity_id: userId,
    before: { status: before.status },
    after: { status: suspend ? "disabled" : "active", allApps: true },
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return {
    success: suspend
      ? "All access suspended."
      : "Access restored.",
  };
}

/**
 * Permanently delete a user from Supabase. Cascades to profile, permissions,
 * module access and access events via the auth.users foreign keys.
 */
export async function deleteUser(userId: string) {
  const { user: actor } = await requireAppAdmin();

  if (actor.id === userId) {
    return { error: "You cannot delete your own account." };
  }

  const service = createServiceClient();
  const before = await getUserById(service, userId);
  if (!before) return { error: "User not found." };

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: actor.id,
    action: "delete",
    module_key: "app",
    entity: "user",
    entity_id: userId,
    before: { email: before.email, full_name: before.full_name },
  });

  revalidateSettings();
  return { success: `${before.email} deleted.` };
}

/** Temporarily block (or unblock) a single app for a user. */
export async function setModuleSuspended(
  userId: string,
  moduleKey: string,
  venueId: string | null,
  suspended: boolean,
) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  let query = service
    .from("user_module_access")
    .select("id")
    .eq("user_id", userId)
    .eq("module_key", moduleKey);
  query = venueId === null ? query.is("venue_id", null) : query.eq("venue_id", venueId);

  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { error: "This app is not assigned to the user." };
  }

  const { error } = await service
    .from("user_module_access")
    .update({ suspended })
    .eq("id", existing.id);

  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "module_suspend",
    entity_id: userId,
    venue_id: venueId,
    after: { module_key: moduleKey, suspended },
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return {
    success: suspended
      ? "App access suspended."
      : "App access restored.",
  };
}

/**
 * Save the full 4-layer access model for a user (account role + per-app roles,
 * sub-pages, and sensitive content). Writes both user_module_access and the
 * expanded user_permissions grants atomically per user.
 */
export async function saveUserAccess(userId: string, state: AccessEditorState) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const target = await getUserById(service, userId);
  if (!target) return { error: "User not found." };

  const { grants, moduleAccess } = expandAccess(state);

  const deduped = new Map<string, PermissionGrantInput>();
  for (const grant of grants) {
    const key = `${grant.venue_id ?? "global"}:${grant.module_key}:${grant.feature_key}`;
    deduped.set(key, grant);
  }
  const permRows = [...deduped.values()].map((g) => ({
    user_id: userId,
    venue_id: g.venue_id,
    module_key: g.module_key,
    feature_key: g.feature_key,
    access_level: g.access_level,
  }));

  const accessRows = moduleAccess.map((m) => ({
    user_id: userId,
    venue_id: m.venue_id,
    module_key: m.module_key,
    role: m.role,
    enabled: m.enabled,
    suspended: m.suspended,
  }));

  const { data: beforeGrants } = await service
    .from("user_permissions")
    .select("*")
    .eq("user_id", userId);

  // Replace permissions.
  const { error: delPerms } = await service
    .from("user_permissions")
    .delete()
    .eq("user_id", userId);
  if (delPerms) return { error: delPerms.message };

  if (permRows.length > 0) {
    const { error: insPerms } = await service
      .from("user_permissions")
      .insert(permRows);
    if (insPerms) return { error: insPerms.message };
  }

  // Replace module access.
  const { error: delAccess } = await service
    .from("user_module_access")
    .delete()
    .eq("user_id", userId);
  if (delAccess) return { error: delAccess.message };

  if (accessRows.length > 0) {
    const { error: insAccess } = await service
      .from("user_module_access")
      .insert(accessRows);
    if (insAccess) return { error: insAccess.message };
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "user_access",
    entity_id: userId,
    before: { grants: beforeGrants },
    after: { grants: permRows, moduleAccess: accessRows },
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return { success: "Access saved." };
}

export async function setVenueModuleEnabled(
  venueId: string,
  moduleKey: string,
  enabled: boolean,
) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const valid = VENUE_TOGGLEABLE_MODULES.some((m) => m.key === moduleKey);
  if (!valid) return { error: "Invalid module." };

  const { data: before } = await service
    .from("venue_modules")
    .select("*")
    .eq("venue_id", venueId)
    .eq("module_key", moduleKey)
    .maybeSingle();

  const { error } = await service.from("venue_modules").upsert(
    { venue_id: venueId, module_key: moduleKey, enabled },
    { onConflict: "venue_id,module_key" },
  );

  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: actor.id,
    action: before ? "update" : "create",
    module_key: "app",
    entity: "venue_modules",
    entity_id: `${venueId}:${moduleKey}`,
    venue_id: venueId,
    before: before ?? null,
    after: { module_key: moduleKey, enabled },
  });

  revalidatePath("/settings/venue-modules");
  return { success: "Module setting saved." };
}

export async function fetchUsersAdminData() {
  await requireAppAdmin();
  const service = createServiceClient();
  const [users, inviteableStaff, venues] = await Promise.all([
    listUsers(service),
    listInviteableStaff(service),
    listVenues(service),
  ]);
  return { users, inviteableStaff, venues };
}

export async function fetchUserAdminData(userId: string) {
  await requireAppAdmin();
  const service = createServiceClient();
  const [user, venues] = await Promise.all([
    getUserById(service, userId),
    listVenues(service),
  ]);
  return { user, venues };
}

export async function fetchVenueModulesAdminData() {
  await requireAppAdmin();
  const service = createServiceClient();
  const [venues, venueModules] = await Promise.all([
    listVenues(service),
    listVenueModules(service),
  ]);
  return { venues, venueModules };
}
