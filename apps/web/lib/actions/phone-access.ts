"use server";

import { revalidatePath } from "next/cache";
import { requireAppAdmin } from "@/lib/access/permissions";
import {
  getAccessMatrixAppColumns,
  type AccessMatrixLevel,
} from "@/lib/access/matrix";
import {
  employeeHubPageKeys,
  loadPhoneAccessRows,
  PHONE_APP_SWITCH_KEY,
  PHONE_HUB_KEY,
} from "@/lib/mobile/phone-access";
import { phoneLevelsFor } from "@/lib/access/phone-levels";
import { createServiceClient } from "@/lib/supabase/service";

const LEVELS: AccessMatrixLevel[] = ["hidden", "none", "viewer", "editor"];

export type PhoneAccessState = {
  canUseApp: boolean;
  levels: Record<string, AccessMatrixLevel>;
  hubPages: string[];
};

function phoneAppKeys(): Set<string> {
  return new Set([
    PHONE_APP_SWITCH_KEY,
    PHONE_HUB_KEY,
    ...getAccessMatrixAppColumns().map((app) => app.key),
  ]);
}

function revalidatePhoneAccess(userId: string) {
  revalidatePath("/mobile/users-access");
  revalidatePath("/mobile/access");
  revalidatePath(`/settings/users/${userId}`);
}

/** One person's phone switches at a venue (Settings → Users editor). */
export async function getPhoneAccessState(input: {
  userId: string;
  venueId: string;
}): Promise<PhoneAccessState> {
  await requireAppAdmin();
  const rows = await loadPhoneAccessRows(
    createServiceClient(),
    input.userId,
    input.venueId,
  );
  const levels: Record<string, AccessMatrixLevel> = {};
  for (const row of rows) levels[row.app_key] = row.level;
  const hub = rows.find((row) => row.app_key === PHONE_HUB_KEY);
  return {
    canUseApp:
      levels[PHONE_APP_SWITCH_KEY] === "viewer" ||
      levels[PHONE_APP_SWITCH_KEY] === "editor",
    levels,
    hubPages: hub?.pages ?? employeeHubPageKeys(),
  };
}

/**
 * Save one phone switch. Only that row changes, so an older open page can't
 * overwrite newer settings. Giving someone an app also turns on "Can use the
 * mobile app" for them, otherwise the grant would do nothing.
 */
export async function setPhoneAccess(input: {
  userId: string;
  venueId: string;
  appKey: string;
  level: AccessMatrixLevel;
  pages?: string[];
}): Promise<{ error?: string; success?: string; switchedOn?: boolean }> {
  const { user: actor } = await requireAppAdmin();
  if (!phoneAppKeys().has(input.appKey)) return { error: "Unknown app." };
  if (!LEVELS.includes(input.level)) return { error: "Unknown access level." };
  if (!phoneLevelsFor(input.appKey).includes(input.level)) {
    return { error: "That level isn't available for this app." };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const allowedPages = new Set(employeeHubPageKeys());
  const pages =
    input.appKey === PHONE_HUB_KEY && input.pages
      ? input.pages.filter((page) => allowedPages.has(page))
      : undefined;

  const row: Record<string, unknown> = {
    user_id: input.userId,
    venue_id: input.venueId,
    app_key: input.appKey,
    level: input.level,
    updated_by: actor.id,
    updated_at: now,
  };
  if (pages) row.pages = pages;

  const { error } = await service
    .from("mobile_app_access")
    .upsert(row, { onConflict: "user_id,venue_id,app_key" });
  if (error) return { error: error.message };

  let switchedOn = false;
  const granted = input.level === "viewer" || input.level === "editor";
  if (granted && input.appKey !== PHONE_APP_SWITCH_KEY) {
    const { data: current } = await service
      .from("mobile_app_access")
      .select("level")
      .eq("user_id", input.userId)
      .eq("venue_id", input.venueId)
      .eq("app_key", PHONE_APP_SWITCH_KEY)
      .maybeSingle();
    if (current?.level !== "viewer" && current?.level !== "editor") {
      const { error: switchError } = await service.from("mobile_app_access").upsert(
        {
          user_id: input.userId,
          venue_id: input.venueId,
          app_key: PHONE_APP_SWITCH_KEY,
          level: "viewer",
          updated_by: actor.id,
          updated_at: now,
        },
        { onConflict: "user_id,venue_id,app_key" },
      );
      if (switchError) return { error: switchError.message };
      switchedOn = true;
    }
  }

  revalidatePhoneAccess(input.userId);
  return {
    success: switchedOn ? "Saved — mobile app switched on." : "Saved.",
    switchedOn,
  };
}
