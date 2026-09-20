import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileWelcomeScreen } from "@/components/mobile/mobile-welcome-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { canAccessHiring } from "@/lib/hr/permissions";
import { mobileNotificationsHref, mobileProfileHref, mobileRevenueHref, mobileSentimentHref, mobileDirectoryHref, mobileHiringHref, mobileTermsHref, MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import { MOBILE_APP_MODULE_KEY } from "@/lib/mobile/types";
import { loadMobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { loadMobileNotifications } from "@/lib/mobile/welcome-notifications";
import { loadModulesHubContext } from "@/lib/modules-hub-data";
import { hubModuleSortIndex } from "@/lib/modules-registry";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileWelcomePage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const [hub, profile, notices] = await Promise.all([
    loadModulesHubContext({
      venue,
      signInHref: `${MOBILE_APP_BASE}/login`,
      selectVenueHref: `${MOBILE_APP_BASE}/select-venue`,
    }),
    loadMobileWelcomeProfile({ venueId: venue.id }),
    loadMobileNotifications(venue),
  ]);

  const modules = hub.sections
    .flatMap((section) => section.modules)
    .filter((mod) => mod.key !== MOBILE_APP_MODULE_KEY)
    .filter((mod) => !hub.hiddenModuleKeys.includes(mod.key))
    .sort((a, b) => hubModuleSortIndex(a.key) - hubModuleSortIndex(b.key));

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileWelcomeScreen
        venue={venue}
        userName={hub.userName}
        modules={modules}
        profile={profile}
        profileHref={mobileProfileHref(venue.slug)}
        employeeHubLevel={hub.employeeHubLevel}
        notificationCount={notices.totalCount}
        unreadCount={notices.unreadCount}
        notificationsHref={mobileNotificationsHref(venue.slug)}
        revenueHref={mobileRevenueHref(venue.slug)}
        sentimentHref={mobileSentimentHref(venue.slug)}
        directoryHref={mobileDirectoryHref(venue.slug)}
        hiringHref={
          canAccessHiring(permissions, venue.id)
            ? mobileHiringHref(venue.slug)
            : undefined
        }
        termsHref={mobileTermsHref(venue.slug)}
      />
    </div>
  );
}
