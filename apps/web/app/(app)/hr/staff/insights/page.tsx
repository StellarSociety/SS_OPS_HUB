import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import { HrOverview } from "@/components/hr/hr-overview";
import { ProbationWidgets } from "@/components/hr/probation-widgets";
import { getHrPageContext } from "@/lib/hr/page-context";
import { buildHrOverviewStats } from "@/lib/hr/overview";
import { listOffBoardingItems } from "@/lib/hr/offboarding";
import { listOnProbationItems } from "@/lib/hr/probation";
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
  const onProbation = listOnProbationItems(staff);
  const offBoarding = listOffBoardingItems(staff);

  return (
    <div className="space-y-4">
      <HrOverview stats={stats} offBoarding={offBoarding} />

      <hr className="border-black/10" />

      <div className="space-y-3">
        <ExpiryWidgets
          items={expiryItems}
          leadDays={leadDays}
          title="Upcoming expiries"
        />

        <ProbationWidgets items={onProbation} title="On probation" />
      </div>
    </div>
  );
}
