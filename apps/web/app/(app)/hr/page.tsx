import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import { HrOverview } from "@/components/hr/hr-overview";
import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import { canAccessStaff } from "@/lib/hr/permissions";
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

export default async function HrOverviewPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canAccessStaff(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Human Resources for this venue.
        </p>
      </div>
    );
  }

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
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModuleShortcuts basePath="/hr" ariaLabel="Human Resources apps" />
        <hr className="mt-4 border-black/10" />
      </div>

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
