"use server";

import { revalidatePath } from "next/cache";
import { requireAppAdmin } from "@/lib/access/permissions";
import {
  getUserById,
  listInviteableStaff,
  listUsers,
  listVenueModules,
  listVenues,
  staffInviteEmail,
} from "@/lib/access/store";
import type { PermissionGrantInput } from "@/lib/access/types";
import { writeAuditLog } from "@/lib/audit";
import {
  buildInviteEmailHtml,
  sendResendEmail,
} from "@/lib/email/resend";
import { VENUE_TOGGLEABLE_MODULES } from "@/lib/modules-catalog";
import { createServiceClient } from "@/lib/supabase/service";

const SETTINGS_PATHS = ["/settings", "/settings/users", "/settings/venue-modules"];

function revalidateSettings() {
  for (const path of SETTINGS_PATHS) {
    revalidatePath(path);
  }
}

export async function inviteUser(staffId: string) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const { data: staff, error: staffError } = await service
    .from("staff")
    .select(
      `
      id,
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

  const email = staffInviteEmail(staff);
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;

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

  const { error: profileError } = await service
    .from("profiles")
    .upsert({
      id: invitedUserId,
      email,
      full_name: staff.full_name,
      staff_id: staff.id,
      status: "active",
    });

  if (profileError) {
    return { error: profileError.message };
  }

  try {
    await sendResendEmail({
      to: email,
      subject: "You're invited to SS Ops Hub",
      html: buildInviteEmailHtml({
        fullName: staff.full_name,
        inviteLink: linkData.properties.action_link,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return { error: message };
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "create",
    module_key: "app",
    entity: "user",
    entity_id: invitedUserId,
    after: {
      email,
      staff_id: staff.id,
      full_name: staff.full_name,
    },
  });

  revalidateSettings();
  return { success: `Invitation sent to ${email}.` };
}

export async function resendUserInvite(userId: string) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const target = await getUserById(service, userId);
  if (!target) {
    return { error: "User not found." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;

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

  try {
    await sendResendEmail({
      to: target.email,
      subject: "Your SS Ops Hub invitation",
      html: buildInviteEmailHtml({
        fullName: target.full_name ?? target.email,
        inviteLink: linkData.properties.action_link,
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
    entity: "user_invite",
    entity_id: userId,
    after: { email: target.email, resent: true },
  });

  revalidateSettings();
  return { success: `Invitation resent to ${target.email}.` };
}

export async function setUserStatus(userId: string, status: "active" | "disabled") {
  const { user: actor } = await requireAppAdmin();

  if (actor.id === userId && status === "disabled") {
    return { error: "You cannot deactivate your own account." };
  }

  const service = createServiceClient();
  const before = await getUserById(service, userId);
  if (!before) {
    return { error: "User not found." };
  }

  const { error } = await service
    .from("profiles")
    .update({ status })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

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

export async function saveUserPermissions(
  userId: string,
  grants: PermissionGrantInput[],
) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const target = await getUserById(service, userId);
  if (!target) {
    return { error: "User not found." };
  }

  const deduped = new Map<string, PermissionGrantInput>();
  for (const grant of grants) {
    const key = `${grant.venue_id ?? "global"}:${grant.module_key}:${grant.feature_key}`;
    deduped.set(key, grant);
  }
  const rows = [...deduped.values()].map((g) => ({
    user_id: userId,
    venue_id: g.venue_id,
    module_key: g.module_key,
    feature_key: g.feature_key,
    access_level: g.access_level,
  }));

  const { data: beforeRows } = await service
    .from("user_permissions")
    .select("*")
    .eq("user_id", userId);

  const { error: deleteError } = await service
    .from("user_permissions")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (rows.length > 0) {
    const { error: insertError } = await service
      .from("user_permissions")
      .insert(rows);

    if (insertError) {
      return { error: insertError.message };
    }
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "app",
    entity: "user_permissions",
    entity_id: userId,
    before: { grants: beforeRows },
    after: { grants: rows },
  });

  revalidateSettings();
  revalidatePath(`/settings/users/${userId}`);
  return { success: "Permissions saved." };
}

export async function setVenueModuleEnabled(
  venueId: string,
  moduleKey: string,
  enabled: boolean,
) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const valid = VENUE_TOGGLEABLE_MODULES.some((m) => m.key === moduleKey);
  if (!valid) {
    return { error: "Invalid module." };
  }

  const { data: before } = await service
    .from("venue_modules")
    .select("*")
    .eq("venue_id", venueId)
    .eq("module_key", moduleKey)
    .maybeSingle();

  const { error } = await service.from("venue_modules").upsert(
    {
      venue_id: venueId,
      module_key: moduleKey,
      enabled,
    },
    { onConflict: "venue_id,module_key" },
  );

  if (error) {
    return { error: error.message };
  }

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
