"use server";

import { listUsers } from "@/lib/access/store";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { fetchGroupBrandingState } from "@/lib/group/branding";
import {
  compareMobileUsersAccessRows,
  hasMobilePushDevice,
  isMobileInstallPlatform,
  isMobileInstallUuid,
  mergeInstallSignals,
  mobileReinstallPushCopy,
  primaryInstallDevice,
  statusForDevices,
  type MobileInstallDevice,
  type MobileUsersAccessRow,
  type PushInstallSignal,
} from "@/lib/mobile/installs";
import {
  listMobileAppInstallsForUsers,
  upsertMobileAppInstall,
} from "@/lib/mobile/installs-store";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { PWA_APP_VERSION, PWA_REINSTALL_URL } from "@/lib/pwa/constants";
import { sendPushToUser } from "@/lib/push/send";
import { listPushSubscriptionsForUsers } from "@/lib/push/store";
import type { UserPermission } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function reportMobileAppInstall(input: {
  deviceId: string;
  venueSlug?: string | null;
  platform: string;
  standalone: boolean;
  appVersion: string;
  swCache?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const deviceId = input.deviceId.trim();
  if (!isMobileInstallUuid(deviceId)) {
    return { ok: false, error: "Invalid device." };
  }
  if (!isMobileInstallPlatform(input.platform)) {
    return { ok: false, error: "Invalid platform." };
  }

  const appVersion = input.appVersion.trim().slice(0, 40);
  if (!appVersion) return { ok: false, error: "Missing version." };

  let venueId: string | null = null;
  const venueSlug = input.venueSlug?.trim() || "";
  if (venueSlug) {
    const { data: venue } = await supabase
      .from("venues")
      .select("id")
      .eq("slug", venueSlug)
      .maybeSingle();
    venueId = venue?.id ?? null;
  }

  const saved = await upsertMobileAppInstall(supabase, user.id, {
    deviceId,
    venueId,
    platform: input.platform,
    standalone: Boolean(input.standalone),
    appVersion,
    swCache: input.swCache?.trim().slice(0, 80) || null,
    userAgent: input.userAgent?.trim().slice(0, 500) || null,
  });
  if (saved.error) return { ok: false, error: saved.error };
  return { ok: true };
}

export async function listMobileUsersAccess(): Promise<MobileUsersAccessRow[]> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return [];
  const { venue, permissions } = ctx;
  if (!canAccessMobileApp(permissions, venue.id)) return [];

  const service = createServiceClient();
  const users = await listUsers(service);
  const withAccess = users.filter((user) => {
    const perms = user.permissions.map((p) => ({
      ...p,
      user_id: user.id,
    })) as UserPermission[];
    return canAccessMobileApp(perms, venue.id);
  });

  const userIds = withAccess.map((u) => u.id);
  const [installs, pushRows, auditRows] = await Promise.all([
    listMobileAppInstallsForUsers(service, userIds),
    listPushSubscriptionsForUsers(service, userIds),
    userIds.length === 0
      ? Promise.resolve({ data: [] as { actor_id: string; created_at: string; after: unknown }[], error: null })
      : service
          .from("audit_log")
          .select("actor_id, created_at, after")
          .eq("module_key", "mobile_app")
          .eq("action", "select")
          .eq("entity", "venue")
          .in("actor_id", userIds),
  ]);
  if (auditRows.error) throw auditRows.error;

  const venueIds = [
    ...new Set(
      installs
        .map((row) => row.venue_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const venueNameById = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: venues } = await service
      .from("venues")
      .select("id, name")
      .in("id", venueIds);
    for (const row of venues ?? []) {
      venueNameById.set(row.id, row.name);
    }
  }

  const lastMobileOpenByUser = new Map<string, string>();
  for (const row of auditRows.data ?? []) {
    const after = row.after as { runtime?: string } | null;
    if (after?.runtime !== "mobile") continue;
    const prev = lastMobileOpenByUser.get(row.actor_id);
    if (!prev || Date.parse(row.created_at) > Date.parse(prev)) {
      lastMobileOpenByUser.set(row.actor_id, row.created_at);
    }
  }

  const pushByUser = new Map<string, PushInstallSignal[]>();
  for (const row of pushRows) {
    if (!isMobileInstallPlatform(row.platform)) continue;
    const list = pushByUser.get(row.user_id) ?? [];
    list.push({
      platform: row.platform,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      userAgent:
        row.userAgent ??
        (row as { user_agent?: string | null }).user_agent ??
        null,
    });
    pushByUser.set(row.user_id, list);
  }

  const heartbeatsByUser = new Map<string, MobileInstallDevice[]>();
  for (const row of installs) {
    if (!isMobileInstallPlatform(row.platform)) continue;
    const list = heartbeatsByUser.get(row.user_id) ?? [];
    list.push({
      deviceId: row.device_id,
      platform: row.platform,
      standalone: row.standalone,
      installed: row.installed,
      appVersion: row.app_version,
      swCache: row.sw_cache,
      userAgent: row.user_agent,
      venueId: row.venue_id,
      venueName: row.venue_id
        ? (venueNameById.get(row.venue_id) ?? null)
        : null,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    });
    heartbeatsByUser.set(row.user_id, list);
  }

  const records: MobileUsersAccessRow[] = withAccess.map((user) => {
    const devices = mergeInstallSignals({
      heartbeats: heartbeatsByUser.get(user.id) ?? [],
      pushDevices: pushByUser.get(user.id) ?? [],
      lastMobileOpenAt: lastMobileOpenByUser.get(user.id) ?? null,
    });
    const primary = primaryInstallDevice(devices);
    return {
      userId: user.id,
      name: user.full_name?.trim() || user.staff?.full_name || user.email,
      email: user.email,
      empNo: user.staff?.emp_no ?? null,
      staffId: user.staff_id,
      photoUrl: user.staff?.photo_url ?? user.avatar_url,
      accountStatus: user.status,
      invitePending: user.status === "active" && !user.invite_accepted_at,
      status: statusForDevices(devices, PWA_APP_VERSION),
      appVersion: primary?.appVersion ?? null,
      platform: primary?.platform ?? null,
      lastSeenAt: primary?.lastSeenAt ?? null,
      deviceCount: devices.length,
      devices,
      canPush: hasMobilePushDevice(pushByUser.get(user.id) ?? []),
    };
  });

  return records.sort(compareMobileUsersAccessRows);
}

export async function sendMobileAppReinstallPush(input?: {
  userIds?: string[];
}): Promise<
  | {
      ok: true;
      sent: number;
      pushed: number;
      inbox: number;
      failed: number;
      skipped: number;
      sentNames: string[];
      pushedNames: string[];
      inboxOnlyNames: string[];
      skippedNames: string[];
    }
  | { ok: false; error: string }
> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { venue, permissions, user } = ctx;
  if (!canAccessMobileApp(permissions, venue.id)) {
    return { ok: false, error: "You do not have access to this page." };
  }

  const records = await listMobileUsersAccess();
  const requestedIds = (input?.userIds ?? [])
    .map((id) => id.trim())
    .filter((id) => isMobileInstallUuid(id));
  const pool =
    requestedIds.length > 0
      ? records.filter((row) => requestedIds.includes(row.userId))
      : records.filter((row) => row.status === "installed_outdated");

  const targets = pool.filter((row) => row.accountStatus !== "disabled");
  const skipped = pool.filter((row) => row.accountStatus === "disabled");
  if (targets.length === 0) {
    return {
      ok: false,
      error:
        skipped.length > 0
          ? "These accounts are disabled, so they cannot be notified."
          : "No outdated phones to notify.",
    };
  }

  const { appName } = await fetchGroupBrandingState();
  const copy = mobileReinstallPushCopy(appName);
  const service = createServiceClient();
  const sentNames: string[] = [];
  const pushedNames: string[] = [];
  const inboxOnlyNames: string[] = [];
  let pushed = 0;
  let inbox = 0;
  let failed = 0;

  for (const row of targets) {
    let delivered = 0;
    if (row.canPush) {
      const result = await sendPushToUser({
        service,
        userId: row.userId,
        payload: {
          title: copy.title,
          body: copy.body,
          url: PWA_REINSTALL_URL,
          tag: "ss-ops-mobile-reinstall",
          severity: "warning",
        },
      });
      delivered = result.sent;
    }

    const { error } = await service.from("notifications").insert({
      user_id: row.userId,
      venue_id: venue.id,
      module_key: "mobile_app",
      type: "mobile_app_reinstall",
      title: copy.title,
      body: copy.inboxBody,
      entity: "mobile_app",
      entity_id: venue.id,
      severity: "warning",
      dedupe_key: `mobile-reinstall:${venue.id}:${row.userId}:${Date.now()}`,
      push_sent_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[mobile-install] inbox notify failed:", error.message);
      failed += 1;
      continue;
    }

    inbox += 1;
    sentNames.push(row.name);
    if (delivered > 0) {
      pushed += 1;
      pushedNames.push(row.name);
    } else {
      inboxOnlyNames.push(row.name);
    }
  }

  if (inbox === 0) {
    return {
      ok: false,
      error: "Could not send to their notification center.",
    };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "create",
    module_key: "mobile_app",
    entity: "mobile_app_reinstall",
    entity_id: venue.id,
    venue_id: venue.id,
    after: {
      sent: inbox,
      pushed,
      inbox,
      failed,
      skipped: skipped.length,
      user_ids: targets.map((row) => row.userId),
    },
  });

  return {
    ok: true,
    sent: inbox,
    pushed,
    inbox,
    failed,
    skipped: skipped.length,
    sentNames,
    pushedNames,
    inboxOnlyNames,
    skippedNames: skipped.map((row) => row.name),
  };
}
