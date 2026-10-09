import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { DeviceSimulator } from "@/components/mobile/device-simulator";
import { fetchGroupLogoState } from "@/lib/group/branding";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { MOBILE_APP_MODULE_KEY } from "@/lib/mobile/types";
import { loadCurrentUserAttendanceMonth } from "@/lib/mobile/employee-attendance";
import { loadMobileEmployeeDocsPage } from "@/lib/mobile/employee-docs";
import { loadMobileEmployeeLeavePage } from "@/lib/mobile/employee-leave";
import { loadMobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { loadMobileNotifications } from "@/lib/mobile/welcome-notifications";
import { loadMobilePreviewEmployees } from "@/lib/mobile/preview-employees";
import {
  loadMobileHiringAppointments,
  loadMobileHiringPage,
} from "@/lib/mobile/hiring-replies";
import { loadDirectoryHierarchy, loadDirectoryStaff } from "@/lib/directory/store";
import { loadModulesHubContext } from "@/lib/modules-hub-data";
import { hubModuleSortIndex } from "@/lib/modules-registry";
import { loadSalesOverviewData } from "@/lib/sales/sales-overview-data";
import {
  loadSentimentWorkspace,
  loadStaffMentionRows,
  sentimentEditFlags,
} from "@/lib/sentiment/workspace";
import { loadSelectVenuePageData } from "@/lib/venue/select-venue-page-data";
import { listMyChats } from "@/lib/connect/chat-store";
import { canAccessConnectSettings, canAdminConnect } from "@/lib/connect/permissions";
import {
  listConnectGroups,
  listConnectPosts,
  loadConnectPeople,
} from "@/lib/connect/store";
import { createServiceClient } from "@/lib/supabase/service";

export default async function MobilePage() {
  const { venue, permissions, supabase, user } = await getMobilePageContext();

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const service = createServiceClient();
  const [
    { logoUrl },
    selectVenue,
    hub,
    profile,
    notices,
    revenueOverview,
    sentimentWorkspace,
    staffRows,
    directory,
    attendance,
    leave,
    docs,
    previewEmployees,
    hiring,
    hiringAppointments,
    connectChats,
    connectGroups,
  ] = await Promise.all([
    fetchGroupLogoState(),
    loadSelectVenuePageData(),
    loadModulesHubContext(),
    loadMobileWelcomeProfile({ venueId: venue.id }),
    loadMobileNotifications(venue),
    loadSalesOverviewData(supabase, venue.id),
    loadSentimentWorkspace(supabase, venue.id),
    loadStaffMentionRows(venue),
    loadDirectoryStaff(supabase, venue).then(async (staff) => ({
      staff,
      hierarchy: await loadDirectoryHierarchy(supabase, venue, staff),
    })),
    loadCurrentUserAttendanceMonth({ venueId: venue.id }),
    loadMobileEmployeeLeavePage({
      userId: user.id,
      venueId: venue.id,
    }),
    loadMobileEmployeeDocsPage({
      userId: user.id,
      venueId: venue.id,
    }),
    loadMobilePreviewEmployees(venue.id),
    loadMobileHiringPage(venue.id),
    loadMobileHiringAppointments(venue.id),
    listMyChats(service, venue.id, user.id),
    listConnectGroups(service, venue.id, {
      userId: user.id,
      seesAllGroups: canAccessConnectSettings(permissions, venue.id),
      isConnectAdmin: canAdminConnect(permissions, venue.id),
    }),
  ]);
  const visibleConnectGroups = connectGroups.filter((group) => group.myRole !== null);
  const [connectPeople, connectFeed] = await Promise.all([
    loadConnectPeople(service, [user.id]),
    listConnectPosts(service, {
      venueId: venue.id,
      groups: visibleConnectGroups,
      viewerId: user.id,
    }),
  ]);
  const sentimentFlags = sentimentEditFlags(permissions, venue.id);

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
      sentiment={{
        reviews: sentimentWorkspace.reviews,
        actionsByReviewId: sentimentWorkspace.actionsByReviewId,
        templates: sentimentWorkspace.templates,
        staffRows,
        googleCanPost: sentimentWorkspace.googleCanPost,
        currentUserId: user.id,
        ...sentimentFlags,
      }}
      directoryStaff={directory.staff}
      directoryHierarchy={directory.hierarchy}
      attendance={attendance}
      leave={leave}
      docs={docs}
      previewEmployees={previewEmployees}
      hiring={hiring}
      hiringAppointments={hiringAppointments}
      connect={{
        chats: connectChats,
        groups: visibleConnectGroups,
        meId: user.id,
        me: connectPeople.get(user.id) ?? null,
        posts: connectFeed.posts,
        nextBefore: connectFeed.nextBefore,
      }}
    />
  );
}
