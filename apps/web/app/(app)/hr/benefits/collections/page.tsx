import { BenefitPoolCollectionsPanel } from "@/components/hr/benefit-pool-collections-panel";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import {
  listBenefitPoolCollections,
  listGratuityRunPoolHintsByMonth,
  mergeGratuitySettings,
  type HrGratuitySettings,
} from "@/lib/hr/benefits";
import { canEditBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function HrBenefitsCollectionsPage() {
  const { supabase, venue, permissions, user } = await getHrPageContext();
  const canEdit = canEditBenefits(permissions, venue.id);
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const userDisplayName = buildExportUserLabel(
    profile?.full_name,
    profile?.email ?? user.email,
  );

  const settingsRaw = await getHrVenueSetting<Partial<HrGratuitySettings>>(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.benefitsGratuity,
    {},
  );
  const settings = mergeGratuitySettings(settingsRaw);

  let rows: Awaited<ReturnType<typeof listBenefitPoolCollections>> = [];
  let gratuityRunByMonth: Awaited<
    ReturnType<typeof listGratuityRunPoolHintsByMonth>
  > = {};
  let migrationRequired = false;

  try {
    [rows, gratuityRunByMonth] = await Promise.all([
      listBenefitPoolCollections(supabase, venue.id),
      listGratuityRunPoolHintsByMonth(supabase, venue.id),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    migrationRequired = /hr_benefit_pool_collections|schema cache|does not exist/i.test(
      message,
    );
    if (!migrationRequired) {
      console.error("[hr/benefits/collections] list:", message);
    }
  }

  return (
    <div className="space-y-6">
      {migrationRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Database migration required</p>
          <p className="mt-1 text-amber-900/80">
            Apply{" "}
            <code className="rounded bg-white/70 px-1">
              supabase/migrations/20260728060000_hr_benefit_pool_collections.sql
            </code>{" "}
            (and{" "}
            <code className="rounded bg-white/70 px-1">
              20260728070000_hr_benefit_pool_collections_rounding.sql
            </code>
            ,{" "}
            <code className="rounded bg-white/70 px-1">
              20260826024800_hr_benefit_pool_collections_withheld_retain.sql
            </code>
            ,{" "}
            <code className="rounded bg-white/70 px-1">
              20260826043700_hr_benefit_pool_collections_benefit_deduction.sql
            </code>{" "}
            for rounding / withheld retain / deducted) then refresh this page.
          </p>
        </div>
      ) : null}

      <BenefitPoolCollectionsPanel
        canEdit={canEdit && !migrationRequired}
        rows={rows}
        gratuityRunByMonth={gratuityRunByMonth}
        osePercent={settings.poolOseDeductPercent}
        activitiesPercent={settings.poolStaffActivitiesDeductPercent}
        periodStartDay={settings.periodStartDay}
        periodEndDay={settings.periodEndDay}
        venueName={venue.name ?? "Venue"}
        venueLogoUrl={getVenueLogoUrl(venue)}
        userDisplayName={userDisplayName}
      />
    </div>
  );
}
