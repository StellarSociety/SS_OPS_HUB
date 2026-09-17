import type { Viewport } from "next";
import { SelectVenueScreen } from "@/components/venue/select-venue-screen";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import { MOBILE_APP_VIEWPORT } from "@/lib/mobile/viewport";
import { loadSelectVenuePageData } from "@/lib/venue/select-venue-page-data";

export const viewport: Viewport = {
  ...MOBILE_APP_VIEWPORT,
  colorScheme: "light",
  themeColor: "#E9E3D6",
};

export default async function MobileSelectVenuePage() {
  const data = await loadSelectVenuePageData({
    signInHref: `${MOBILE_APP_BASE}/login`,
    requireMobileAppAccess: true,
  });
  return <SelectVenueScreen {...data} fill runtime="mobile" />;
}
