import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { MobileAppInsightsClient } from "@/components/mobile/mobile-app-insights-client";
import { listMobileAppInsights } from "@/lib/actions/mobile-usage";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";

export default async function MobileAppInsightsPage() {
  const { permissions, venue } = await getMobilePageContext();

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const insights = await listMobileAppInsights();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>App Insights</ModulePageTitle>
        <hr className="mt-4 border-black/10" />
      </div>
      <MobileAppInsightsClient initial={insights} />
    </div>
  );
}
