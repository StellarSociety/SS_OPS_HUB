import { SelectVenueScreen } from "@/components/venue/select-venue-screen";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import { loadSelectVenuePageData } from "@/lib/venue/select-venue-page-data";

export default async function MobileSelectVenuePage() {
  const data = await loadSelectVenuePageData({
    signInHref: `${MOBILE_APP_BASE}/login`,
  });
  return (
    <SelectVenueScreen
      {...data}
      venues={data.venues.filter((venue) => !venue.is_global)}
      runtime="mobile"
    />
  );
}
