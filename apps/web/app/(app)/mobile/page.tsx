import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { DeviceSimulator } from "@/components/mobile/device-simulator";
import { fetchGroupLogoState } from "@/lib/group/branding";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { MOBILE_APP_MODULE_KEY } from "@/lib/mobile/types";
import { loadMobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { loadMobileNotifications } from "@/lib/mobile/welcome-notifications";
import { loadModulesHubContext } from "@/lib/modules-hub-data";
import { hubModuleSortIndex } from "@/lib/modules-registry";
import { loadSalesOverviewData } from "@/lib/sales/sales-overview-data";
import { loadSelectVenuePageData } from "@/lib/venue/select-venue-page-data";

export default async function MobilePage() {
  const { venue, permissions, supabase } = await getMobilePageContext();

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const [{ logoUrl }, selectVenue, hub, profile, notices, revenueOverview] =
    await Promise.all([
      fetchGroupLogoState(),
      loadSelectVenuePageData(),
      loadModulesHubContext(),
      loadMobileWelcomeProfile(),
      loadMobileNotifications(venue),
      loadSalesOverviewData(supabase, venue.id),
    ]);

  const modules = hub.sections
    .flatMap((section) => section.modules)
    .filter((mod) => mod.key !== MOBILE_APP_MODULE_KEY)
    .sort((a, b) => hubModuleSortIndex(a.key) - hubModuleSortIndex(b.key));

  return (
    <DeviceSimulator
      loginLogoUrl={logoUrl}
      selectVenue={selectVenue}
      welcome={{
        userName: hub.userName ?? selectVenue.fullName,
        venue,
        modules,
        profile,
        notificationCount: notices.totalCount,
        unreadCount: notices.unreadCount,
        notifications: notices.notifications,
      }}
      revenueOverview={revenueOverview}
    />
  );
}
