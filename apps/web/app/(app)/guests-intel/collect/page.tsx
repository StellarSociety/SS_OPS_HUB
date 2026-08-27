import { CollectSimulator } from "@/components/guests-intel/collect-simulator";
import { canAccessCollect } from "@/lib/guests-intel/permissions";
import { getGuestsIntelCollectPage } from "@/lib/guests-intel/page-context";
import { venueThemeStyle } from "@/lib/venue/theme";

export default async function GuestsIntelCollectPage() {
  const { venue, permissions, rewards, canEdit, settings } =
    await getGuestsIntelCollectPage("");

  if (!canAccessCollect(permissions, venue.id)) {
    return null;
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <CollectSimulator
        rewards={rewards}
        defaultRewardId={settings?.default_reward_id ?? null}
        canEdit={canEdit}
        thankYou={settings?.thank_you_message ?? ""}
        publicToken={settings?.public_token ?? null}
        themeStyle={venueThemeStyle(venue)}
      />
    </div>
  );
}
