import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileWelcomeScreen } from "@/components/mobile/mobile-welcome-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { canAccessHiring } from "@/lib/hr/permissions";
import { mobileConnectHref, mobileNotificationsHref, mobileProfileHref, mobileRevenueHref, mobileSentimentHref, mobileDirectoryHref, mobileHiringHref, mobileTermsHref } from "@/lib/mobile/app-path";
import { loadMobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { loadMobileNotifications } from "@/lib/mobile/welcome-notifications";
import { loadMobileWelcomeModulesForUser } from "@/lib/modules-hub-data";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileWelcomePage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions, supabase, user } =
    await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const [hub, profile, notices] = await Promise.all([
    loadMobileWelcomeModulesForUser(supabase, user.id, venue),
    loadMobileWelcomeProfile({ venueId: venue.id }),
    loadMobileNotifications(venue),
  ]);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileWelcomeScreen
        venue={venue}
        userName={hub.userName}
        modules={hub.modules}
        profile={profile}
        profileHref={mobileProfileHref(venue.slug)}
        employeeHubLevel={hub.employeeHubLevel}
        notificationCount={notices.totalCount}
        unreadCount={notices.unreadCount}
        notificationsHref={mobileNotificationsHref(venue.slug)}
        connectHref={mobileConnectHref(venue.slug)}
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
