import { headers } from "next/headers";
import { CollectSharePanel } from "@/components/guests-intel/collect-share-panel";
import { canAccessCollect } from "@/lib/guests-intel/permissions";
import { getGuestsIntelCollectPage } from "@/lib/guests-intel/page-context";

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  if (!host) return "";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export default async function GuestsIntelCollectSharePage() {
  const origin = await requestOrigin();
  const { venue, permissions, formUrl, formQrPngDataUrl, venueLogoUrl, settings } =
    await getGuestsIntelCollectPage(origin);

  if (!canAccessCollect(permissions, venue.id)) {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto">
      <CollectSharePanel
        formUrl={formUrl}
        formQrPngDataUrl={formQrPngDataUrl}
        publicFormEnabled={settings?.public_form_enabled ?? false}
        venueName={venue.name.trim() || "Venue"}
        venueLogoUrl={venueLogoUrl}
        venueSlug={venue.slug}
        primaryColor={venue.primary_color}
        secondaryColor={venue.secondary_color}
      />
    </div>
  );
}
