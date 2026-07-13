import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import { HrOverview } from "@/components/hr/hr-overview";
import { getHrPageContext } from "@/lib/hr/page-context";
import { buildHrOverviewStats } from "@/lib/hr/overview";
import {
  getExpiryItems,
  getHrVenueSetting,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_EXPIRY_SETTINGS,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";

export default async function StaffInsightsPage() {
  const { supabase, venue } = await getHrPageContext();

  const expirySettings = await getHrVenueSetting(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.expiry,
    DEFAULT_HR_EXPIRY_SETTINGS,
  );
  const leadDays = expirySettings.displayWindowDays;

  const [staff, expiryItems] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    getExpiryItems(supabase, venue.id, leadDays, {
      allVenues: venue.is_global,
    }),
  ]);

  const stats = buildHrOverviewStats(staff, expiryItems);

  return (
    <div className="space-y-6">
      <HrOverview stats={stats} />

      <hr className="border-black/10" />

      <ExpiryWidgets
        items={expiryItems}
        leadDays={leadDays}
        title="Upcoming expiries"
      />
    </div>
  );
}
