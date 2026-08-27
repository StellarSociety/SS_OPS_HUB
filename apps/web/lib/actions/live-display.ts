"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { createServiceClient } from "@/lib/supabase/service";
import { canEditLiveDisplay } from "@/lib/sentiment/permissions";
import { SENTIMENT_MODULE_KEY } from "@/lib/sentiment/types";
import { liveDisplayPath } from "@/lib/sentiment/live-display/types";
import {
  rotateLiveDisplayCode,
  updateLiveDisplaySettings,
} from "@/lib/sentiment/live-display/store";

function fail(message: string) {
  return { ok: false as const, error: message };
}

function revalidateLiveDisplay(code?: string) {
  revalidatePath("/sentiment/live-display", "page");
  revalidatePath("/sentiment/live-display/share", "page");
  if (code) revalidatePath(liveDisplayPath(code), "page");
}

type EditorAuth =
  | { error: string }
  | {
      userId: string;
      venueId: string;
      service: ReturnType<typeof createServiceClient>;
    };

async function requireEditor(): Promise<EditorAuth> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };
  if (auth.venue.is_global) {
    return { error: "Open Live Display from a venue, not Global." };
  }
  if (!canEditLiveDisplay(auth.permissions, auth.venue.id)) {
    return { error: "You need Live Display edit access." };
  }
  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

export async function setLiveDisplayEnabled(enabled: boolean) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);

  try {
    const settings = await updateLiveDisplaySettings(auth.service, auth.venueId, {
      enabled,
    });
    await writeAuditLog({
      actor_id: auth.userId,
      action: "live_display.enabled.save",
      module_key: SENTIMENT_MODULE_KEY,
      entity: "live_display_settings",
      entity_id: auth.venueId,
      venue_id: auth.venueId,
      after: { enabled: settings.enabled },
    });
    revalidateLiveDisplay(settings.public_code);
    return { ok: true as const, enabled: settings.enabled };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save.");
  }
}

export async function rotateLiveDisplayLink() {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);

  try {
    const settings = await rotateLiveDisplayCode(auth.service, auth.venueId);
    await writeAuditLog({
      actor_id: auth.userId,
      action: "live_display.link.rotate",
      module_key: SENTIMENT_MODULE_KEY,
      entity: "live_display_settings",
      entity_id: auth.venueId,
      venue_id: auth.venueId,
      after: { public_code: settings.public_code },
    });
    revalidateLiveDisplay(settings.public_code);
    return { ok: true as const, code: settings.public_code };
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not rotate the link.",
    );
  }
}
