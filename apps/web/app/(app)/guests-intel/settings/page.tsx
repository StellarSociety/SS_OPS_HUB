import { headers } from "next/headers";
import { GuestsIntelSettingsPanel } from "@/components/guests-intel/settings-panel";
import { canAdminSettings } from "@/lib/guests-intel/permissions";
import { getGuestsIntelPageContext } from "@/lib/guests-intel/page-context";
import { listRewards } from "@/lib/guests-intel/store";
import { guestFormPath } from "@/lib/guests-intel/types";
import { createServiceClient } from "@/lib/supabase/service";

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  if (!host) return "";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export default async function GuestsIntelSettingsPage() {
  const { venue, permissions, settings } = await getGuestsIntelPageContext();
  const rewards = settings
    ? await listRewards(createServiceClient(), venue.id, {
        includeArchived: true,
      }).catch(() => [])
    : [];
  const origin = await requestOrigin();
  const formUrl =
    settings && origin ? `${origin}${guestFormPath(settings.public_token)}` : "";

  if (!settings) {
    return (
      <p className="text-sm text-black/55">
        Guests Intel is available on venue workspaces, not Global.
      </p>
    );
  }

  return (
    <GuestsIntelSettingsPanel
      settings={settings}
      rewards={rewards}
      formUrl={formUrl}
      canEdit={canAdminSettings(permissions, venue.id)}
    />
  );
}
