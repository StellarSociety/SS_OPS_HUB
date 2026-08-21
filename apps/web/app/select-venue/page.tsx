import { SelectVenueScreen } from "@/components/venue/select-venue-screen";
import { loadSelectVenuePageData } from "@/lib/venue/select-venue-page-data";

export default async function SelectVenuePage() {
  const data = await loadSelectVenuePageData();
  return <SelectVenueScreen {...data} />;
}
