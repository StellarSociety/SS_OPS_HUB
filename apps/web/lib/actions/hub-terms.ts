"use server";

import { revalidatePath } from "next/cache";
import { listUsers } from "@/lib/access/store";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  userHasAcceptedHubTerms,
  type HubTermsClient,
  type HubTermsUserRecord,
} from "@/lib/hub-terms";
import { canViewStaff, hasHrFeatureAccess } from "@/lib/hr/permissions";
import { HUB_TERMS_VERSION } from "@/lib/mobile/terms-content";
import { isAppAdmin, type UserPermission } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function userHasVenueAccess(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;
  return permissions.some(
    (p) => p.venue_id === venueId || p.venue_id == null,
  );
}

export async function hasAcceptedCurrentHubTerms(
  venueId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;
  return userHasAcceptedHubTerms({
    supabase,
    userId: user.id,
    venueId,
  });
}

export async function acceptHubTerms(input: {
  venueId: string;
  client: HubTermsClient;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const venueId = String(input.venueId ?? "").trim();
  const client: HubTermsClient = input.client === "mobile" ? "mobile" : "web";
  if (!venueId) return { ok: false, error: "Missing venue." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in. Sign in again and retry." };

  const [{ data: venue }, { data: permissionRows }, { data: profile }] =
    await Promise.all([
      supabase.from("venues").select("id, slug").eq("id", venueId).maybeSingle(),
      supabase.from("user_permissions").select("*").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (!venue?.id) return { ok: false, error: "Venue not found." };

  const permissions = (permissionRows ?? []) as UserPermission[];
  if (!userHasVenueAccess(permissions, venue.id)) {
    return { ok: false, error: "You do not have access to this venue." };
  }

  const already = await userHasAcceptedHubTerms({
    supabase,
    userId: user.id,
    venueId: venue.id,
  });
  if (already) {
    return { ok: true };
  }

  const userEmail = (profile?.email ?? user.email ?? "").trim();
  const userName = (profile?.full_name ?? "").trim();

  const { error } = await supabase.from("hub_terms_acknowledgements").insert({
    user_id: user.id,
    venue_id: venue.id,
    terms_version: HUB_TERMS_VERSION,
    client,
    user_email: userEmail,
    user_name: userName,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true };
    }
    return { ok: false, error: error.message || "Failed to save acknowledgement." };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "create",
    module_key: "app",
    entity: "hub_terms_acknowledgement",
    entity_id: user.id,
    venue_id: venue.id,
    after: { terms_version: HUB_TERMS_VERSION, client },
  });

  revalidateHubTermsPaths(venue.slug);
  return { ok: true };
}

export async function listHubTermsAcknowledgements(): Promise<
  HubTermsUserRecord[]
> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return [];
  const { venue, permissions } = ctx;

  if (
    !hasHrFeatureAccess(permissions, "communications", venue.id) &&
    !canViewStaff(permissions, venue.id)
  ) {
    return [];
  }

  const service = createServiceClient();
  const [users, ackResult] = await Promise.all([
    listUsers(service),
    service
      .from("hub_terms_acknowledgements")
      .select("user_id, client, accepted_at")
      .eq("venue_id", venue.id)
      .eq("terms_version", HUB_TERMS_VERSION),
  ]);

  const ackByUser = new Map<
    string,
    { client: HubTermsClient; acceptedAt: string }
  >();
  for (const row of ackResult.data ?? []) {
    ackByUser.set(row.user_id, {
      client: row.client === "mobile" ? "mobile" : "web",
      acceptedAt: row.accepted_at,
    });
  }

  const records: HubTermsUserRecord[] = [];
  for (const user of users) {
    const perms = user.permissions.map((p) => ({
      id: p.id,
      user_id: user.id,
      venue_id: p.venue_id,
      module_key: p.module_key,
      feature_key: p.feature_key,
      access_level: p.access_level,
    })) as UserPermission[];
    const moduleOk = user.moduleAccess.some(
      (m) =>
        m.enabled &&
        !m.suspended &&
        (m.venue_id === venue.id || m.venue_id == null),
    );
    if (!userHasVenueAccess(perms, venue.id) && !moduleOk) continue;

    const ack = ackByUser.get(user.id) ?? null;
    records.push({
      userId: user.id,
      name: user.full_name?.trim() || user.staff?.full_name || user.email,
      email: user.email,
      empNo: user.staff?.emp_no ?? null,
      staffId: user.staff_id,
      photoUrl: user.staff?.photo_url ?? user.avatar_url,
      status: ack ? "acknowledged" : "pending",
      client: ack?.client ?? null,
      acceptedAt: ack?.acceptedAt ?? null,
      lastLoginAt: user.last_login_at,
      accountStatus: user.status,
    });
  }

  return records.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function revalidateHubTermsPaths(venueSlug: string | null | undefined) {
  revalidatePath("/hr/communications/acknowledgements/hub-terms", "page");
  if (venueSlug) {
    revalidatePath(
      `/venue/${venueSlug}/hr/communications/acknowledgements/hub-terms`,
      "page",
    );
    revalidatePath(`/m/${venueSlug}`, "layout");
  }
}
