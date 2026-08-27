import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import { HrOverview } from "@/components/hr/hr-overview";
import { MissingDetailsWidgets } from "@/components/hr/missing-details-widgets";
import { WorkAnniversaryWidgets } from "@/components/hr/work-anniversary-widgets";
import { getHrPageContext } from "@/lib/hr/page-context";
import { EMPLOYMENT_STATUS_NAMES } from "@/lib/hr/employment-status";
import { listMissingDetailItems } from "@/lib/hr/missing-details";
import { buildHrOverviewStats } from "@/lib/hr/overview";
import { listOffBoardingItems } from "@/lib/hr/offboarding";
import { listOnProbationItems } from "@/lib/hr/probation";
import { processDueWorkAnniversaryEmails } from "@/lib/hr/process-work-anniversary-emails";
import {
  DEFAULT_ANNIVERSARY_LEAD_DAYS,
  listWorkAnniversaryItems,
} from "@/lib/hr/work-anniversaries";
import {
  getExpiryItems,
  getHrVenueSetting,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_EXPIRY_SETTINGS,
  HR_SETTINGS_KEYS,
  partitionExpiryItems,
} from "@/lib/hr/types";
import { GraduationCap } from "lucide-react";

export default async function StaffInsightsPage() {
  const { supabase, venue } = await getHrPageContext();

  // Flush due auto-sends so today's anniversaries are not waiting only on cron.
  await processDueWorkAnniversaryEmails({
    venueId: venue.id,
    limit: 25,
  });

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
  const missingDetails = listMissingDetailItems(staff);
  const missingDetailsOut = listMissingDetailItems(
    staff,
    EMPLOYMENT_STATUS_NAMES.out,
  );
  const anniversaries = listWorkAnniversaryItems(
    staff,
    DEFAULT_ANNIVERSARY_LEAD_DAYS,
  );
  const { documents: documentExpiries, trainings: trainingExpiries } =
    partitionExpiryItems(expiryItems);

  return (
    <div className="space-y-4">
      <div className="grid w-full gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <WorkAnniversaryWidgets
          items={anniversaries}
          leadDays={DEFAULT_ANNIVERSARY_LEAD_DAYS}
          title="Work anniversaries"
        />

        <ExpiryWidgets
          items={documentExpiries}
          leadDays={leadDays}
          title="Upcoming expiries"
          emptyDescription={`No passport, ID, visa, or insurance items expiring within ${leadDays} days.`}
        />

        <ExpiryWidgets
          items={trainingExpiries}
          leadDays={leadDays}
          title="Training expiries"
          icon={GraduationCap}
          emptyDescription={`No training certificates expiring within ${leadDays} days.`}
        />
      </div>

      <hr className="border-black/10" />

      <HrOverview
        stats={stats}
        offBoarding={offBoarding}
        onProbation={onProbation}
      />

      <MissingDetailsWidgets
        items={missingDetails}
        title="Missing details"
        emptyDescription="All ON Board staff have the tracked profile fields filled in."
      />

      <MissingDetailsWidgets
        items={missingDetailsOut}
        title="Missing details — OUT"
        emptyDescription="All OUT staff have the tracked profile fields filled in."
      />
    </div>
  );
}
