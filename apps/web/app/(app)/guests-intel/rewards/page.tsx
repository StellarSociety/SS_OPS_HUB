import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { RewardsEditor } from "@/components/guests-intel/rewards-editor";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessRewards } from "@/lib/guests-intel/permissions";
import { getGuestsIntelRewardsPage } from "@/lib/guests-intel/page-context";

export default async function GuestsIntelRewardsPage() {
  const { venue, permissions, rewards, canEdit } =
    await getGuestsIntelRewardsPage();

  if (!canAccessRewards(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Rewards</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Promotions, vouchers, discounts, and complementary items issued as
          guest passes.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <RewardsEditor rewards={rewards} canEdit={canEdit} />
    </div>
  );
}
