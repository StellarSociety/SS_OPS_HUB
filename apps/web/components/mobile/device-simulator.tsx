"use client";

import { useCallback, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoginScreen } from "@/components/auth/login-screen";
import { AppPathPanel } from "@/components/mobile/app-path-panel";
import { MobileEmployeeAttendanceScreen } from "@/components/mobile/mobile-employee-attendance-screen";
import { MobileEmployeeDocsScreen } from "@/components/mobile/mobile-employee-docs-screen";
import { MobileEmployeeLeaveScreen } from "@/components/mobile/mobile-employee-leave-screen";
import { MobileEmployeeProfileScreen } from "@/components/mobile/mobile-employee-profile-screen";
import { MobileNotificationSettingsScreen } from "@/components/mobile/mobile-notification-settings-screen";
import { MobileNotificationsScreen } from "@/components/mobile/mobile-notifications-screen";
import { MobileRevenueScreen } from "@/components/mobile/mobile-revenue-screen";
import {
  MobileSentimentScreen,
  type MobileSentimentBundle,
  type MobileSentimentTab,
} from "@/components/mobile/mobile-sentiment-screen";
import { MobileTermsScreen } from "@/components/mobile/mobile-terms-screen";
import { MobileWelcomeScreen } from "@/components/mobile/mobile-welcome-screen";
import { MobileDirectoryScreen } from "@/components/mobile/mobile-directory-screen";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";
import { MobileChromeHostProvider } from "@/components/mobile/mobile-chrome-host";
import {
  MobileNavBusyProvider,
  MobilePageLoadingOverlay,
} from "@/components/mobile/mobile-nav-busy";
import { SelectVenueScreen } from "@/components/venue/select-venue-screen";
import {
  APP_PATH,
  appPathPublicHref,
  getAppPathPage,
  type AppPathPage,
} from "@/lib/mobile/app-path";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { loadMobilePreviewEmployeeAction } from "@/lib/actions/mobile-preview-employee";
import type { MobileAttendanceMonth } from "@/lib/mobile/employee-attendance";
import type { MobileDocsPage } from "@/lib/mobile/employee-docs";
import type { MobileLeavePage } from "@/lib/mobile/employee-leave";
import type { MobilePreviewEmployee } from "@/lib/mobile/preview-employees";
import type { MobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import type { DirectoryStaffMember } from "@/lib/directory/types";
import type { HierarchyNode } from "@/lib/directory/hierarchy-tree";
import {
  notificationMatchesFolder,
  type NotificationFolder,
} from "@/lib/notifications/folder";
import type { NotificationRow } from "@/lib/notifications/types";
import type { SelectVenuePageData } from "@/lib/venue/select-venue-page-data";
import type { SalesOverviewResult } from "@/lib/sales/sales-overview-data";
import type { Venue } from "@/lib/types/database";
import { DevicePreviewChrome } from "@/components/simulators/device-preview-chrome";
import { DevicePreviewDensity, COMPACT_PREVIEW_DENSITY } from "@/components/simulators/device-preview-density";
import { DevicePreviewStage } from "@/components/simulators/device-preview-stage";
import {
  DEFAULT_DEVICE_ID,
  DEVICE_BRANDS,
  deviceRatioLabel,
  deviceSafeInsets,
  devicesForBrand,
  getDevicePreset,
  type DeviceBrand,
  type DevicePreset,
} from "@/lib/mobile/device-presets";

const BEZEL = 14;
const HOME_BUTTON_EXTRA = 52;

type WelcomePreview = {
  userName: string | null;
  venue: Venue;
  modules: ModuleGridItem[];
  profile: MobileWelcomeProfile;
  notificationCount: number;
  unreadCount: number;
  notifications: NotificationRow[];
};

function frameSize(device: DevicePreset) {
  const extraBottom = device.island === "home-button" ? HOME_BUTTON_EXTRA : 0;
  return {
    width: device.width + BEZEL * 2,
    height: device.height + BEZEL * 2 + extraBottom,
  };
}

function sentimentTabFromPageId(pageId: string): MobileSentimentTab {
  if (pageId === "sentiment-reviews") return "reviews";
  if (pageId === "sentiment-calendar") return "calendar";
  if (pageId === "sentiment-actions") return "actions";
  return "dashboard";
}

function notificationFolderFromPageId(
  pageId: string,
): NotificationFolder | null {
  if (pageId === "notifications") return "inbox";
  if (pageId === "notification-alerts") return "alerts";
  if (pageId === "notification-archive") return "archive";
  return null;
}

function directoryTabFromPageId(
  pageId: string,
): "staff" | "celebrations" | "hierarchy" {
  if (pageId === "directory-celebrations") return "celebrations";
  if (pageId === "directory-hierarchy") return "hierarchy";
  return "staff";
}

export function DeviceSimulator({
  loginLogoUrl,
  selectVenue,
  welcome,
  revenueOverview,
  sentiment,
  directoryStaff,
  directoryHierarchy,
  attendance,
  leave,
  docs,
  previewEmployees,
}: {
  loginLogoUrl: string;
  selectVenue: SelectVenuePageData;
  welcome: WelcomePreview;
  revenueOverview: SalesOverviewResult;
  sentiment: MobileSentimentBundle;
  directoryStaff: DirectoryStaffMember[];
  directoryHierarchy: HierarchyNode[];
  attendance: MobileAttendanceMonth;
  leave: MobileLeavePage;
  docs: MobileDocsPage;
  previewEmployees: MobilePreviewEmployee[];
}) {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [pageId, setPageId] = useState(APP_PATH[0].id);
  const [previewVenue, setPreviewVenue] = useState(welcome.venue);
  const device = getDevicePreset(deviceId);
  const brand = device.brand;
  const brandDevices = useMemo(() => devicesForBrand(brand), [brand]);
  const ratio = deviceRatioLabel(device.width, device.height);
  const page = getAppPathPage(pageId);
  const previewPath = appPathPublicHref(page, previewVenue);

  function selectBrand(next: DeviceBrand) {
    if (next === brand) return;
    const first = devicesForBrand(next)[0];
    if (first) setDeviceId(first.id);
  }

  return (
    <div className="-mx-4 -mb-4 -mt-3 flex h-[calc(100%+1.75rem)] min-h-0 flex-col overflow-hidden px-4 pt-3 md:-mx-8 md:-mb-8 md:-mt-4 md:h-[calc(100%+3rem)] md:px-8 md:pt-4">
      <DevicePreviewChrome
        title="SS OPS HUB Mobile Simulator"
        formatValue={brand}
        formatOptions={DEVICE_BRANDS.map((item) => ({
          value: item.key,
          label: item.label,
        }))}
        onFormatChange={(value) => selectBrand(value as DeviceBrand)}
        modelValue={device.id}
        modelOptions={brandDevices.map((item) => ({
          value: item.id,
          label: item.label,
        }))}
        onModelChange={setDeviceId}
        spec={`${device.label} · ${device.width} × ${device.height} · ${ratio} · ${device.dpr}×`}
        previewPath={previewPath}
      />

      <PhoneStage
        device={device}
        loginLogoUrl={loginLogoUrl}
        selectVenue={selectVenue}
        welcome={welcome}
        revenueOverview={revenueOverview}
        sentiment={sentiment}
        directoryStaff={directoryStaff}
        directoryHierarchy={directoryHierarchy}
        attendance={attendance}
        leave={leave}
        docs={docs}
        previewEmployees={previewEmployees}
        pageId={pageId}
        setPageId={setPageId}
        previewVenue={previewVenue}
        setPreviewVenue={setPreviewVenue}
      />
    </div>
  );
}

function PhoneStage({
  device,
  loginLogoUrl,
  selectVenue,
  welcome,
  revenueOverview,
  sentiment,
  directoryStaff,
  directoryHierarchy,
  attendance,
  leave,
  docs,
  previewEmployees,
  pageId,
  setPageId,
  previewVenue,
  setPreviewVenue,
}: {
  device: DevicePreset;
  loginLogoUrl: string;
  selectVenue: SelectVenuePageData;
  welcome: WelcomePreview;
  revenueOverview: SalesOverviewResult;
  sentiment: MobileSentimentBundle;
  directoryStaff: DirectoryStaffMember[];
  directoryHierarchy: HierarchyNode[];
  attendance: MobileAttendanceMonth;
  leave: MobileLeavePage;
  docs: MobileDocsPage;
  previewEmployees: MobilePreviewEmployee[];
  pageId: string;
  setPageId: (id: string) => void;
  previewVenue: Venue;
  setPreviewVenue: (venue: Venue) => void;
}) {
  const router = useRouter();
  const [previewNonce, setPreviewNonce] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const [staffBusy, startStaffPreview] = useTransition();
  const [previewStaffId, setPreviewStaffId] = useState("");
  const [previewOverride, setPreviewOverride] = useState<{
    profile: MobileWelcomeProfile;
    attendance: MobileAttendanceMonth;
    leave: MobileLeavePage;
    docs: MobileDocsPage;
    userName: string | null;
  } | null>(null);
  const frame = frameSize(device);
  const page = getAppPathPage(pageId);
  const previewWelcome = previewOverride
    ? {
        ...welcome,
        userName: previewOverride.userName,
        profile: previewOverride.profile,
      }
    : welcome;
  const previewAttendance = previewOverride?.attendance ?? attendance;
  const previewLeave = previewOverride?.leave ?? leave;
  const previewDocs = previewOverride?.docs ?? docs;

  const handleRefreshPreview = useCallback(() => {
    startRefresh(() => {
      setPreviewVenue(welcome.venue);
      setPreviewNonce((current) => current + 1);
      router.refresh();
    });
  }, [router, setPreviewVenue, startRefresh, welcome.venue]);

  const handlePreviewStaffChange = useCallback(
    (staffId: string) => {
      if (!staffId) {
        setPreviewStaffId("");
        setPreviewOverride(null);
        setPreviewNonce((current) => current + 1);
        return;
      }
      setPreviewStaffId(staffId);
      startStaffPreview(async () => {
        const bundle = await loadMobilePreviewEmployeeAction({
          venueId: previewVenue.id,
          staffId,
          monthKey: previewAttendance.monthKey,
        });
        if (!bundle) {
          setPreviewStaffId("");
          setPreviewOverride(null);
          return;
        }
        setPreviewOverride(bundle);
        setPreviewNonce((current) => current + 1);
      });
    },
    [previewAttendance.monthKey, previewVenue.id],
  );

  const handleAuthenticated = useCallback(() => {
    setPageId("select-venue");
    router.refresh();
  }, [router, setPageId]);

  const handleVenueSelected = useCallback(
    (venue: Venue) => {
      setPreviewVenue(venue);
      setPageId("welcome");
    },
    [setPageId, setPreviewVenue],
  );

  return (
    <DevicePreviewStage
      frameWidth={frame.width}
      frameHeight={frame.height}
      panel={
        <AppPathPanel
          selectedId={pageId}
          onSelect={setPageId}
          venue={previewVenue}
          refreshing={refreshing || staffBusy}
          onRefreshPreview={handleRefreshPreview}
          previewEmployees={previewEmployees}
          previewStaffId={previewStaffId}
          onPreviewStaffChange={handlePreviewStaffChange}
          previewStaffBusy={staffBusy}
        />
      }
    >
      <PhoneChrome
        device={device}
        page={page}
        refreshing={refreshing}
        onRefresh={handleRefreshPreview}
        screen={
          <div key={previewNonce} className="h-full min-h-0">
            {page.id === "login" ? (
              <LoginScreen
                logoUrl={loginLogoUrl}
                fill
                preview
                onAuthenticated={handleAuthenticated}
              />
            ) : page.id === "select-venue" ? (
              <SelectVenueScreen
                {...selectVenue}
                fill
                preview
                runtime="mobile"
                onSelectVenue={handleVenueSelected}
              />
            ) : page.id === "welcome" ? (
              <MobileWelcomeScreen
                venue={previewVenue}
                userName={previewWelcome.userName}
                modules={previewWelcome.modules}
                profile={previewWelcome.profile}
                onOpenProfile={() => setPageId("employee-profile")}
                notificationCount={previewWelcome.notificationCount}
                unreadCount={previewWelcome.unreadCount}
                onOpenNotifications={() => setPageId("notifications")}
                onOpenRevenue={() => setPageId("revenue")}
                onOpenSentiment={() => setPageId("sentiment")}
                onOpenDirectory={() => setPageId("directory")}
                onOpenTerms={() => setPageId("terms")}
                onLogout={() => setPageId("login")}
              />
            ) : notificationFolderFromPageId(page.id) ? (
              <MobileNotificationsScreen
                key={page.id}
                venue={previewVenue}
                folder={notificationFolderFromPageId(page.id)!}
                notifications={previewWelcome.notifications.filter((n) =>
                  notificationMatchesFolder(
                    n,
                    notificationFolderFromPageId(page.id)!,
                  ),
                )}
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id === "notification-settings" ? (
              <MobileNotificationSettingsScreen
                venue={previewVenue}
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id === "employee-profile" ? (
              <MobileEmployeeProfileScreen
                venue={previewVenue}
                profile={previewWelcome.profile}
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id === "attendance" ? (
              <MobileEmployeeAttendanceScreen
                venue={previewVenue}
                initial={previewAttendance}
                previewStaffId={previewStaffId || null}
                employeeName={
                  previewWelcome.profile.fullName ?? previewWelcome.userName
                }
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id === "leave" ? (
              <MobileEmployeeLeaveScreen
                venue={previewVenue}
                initial={previewLeave}
                previewStaffId={previewStaffId || null}
                employeeName={
                  previewWelcome.profile.fullName ?? previewWelcome.userName
                }
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id === "docs" ? (
              <MobileEmployeeDocsScreen
                venue={previewVenue}
                initial={previewDocs}
                previewStaffId={previewStaffId || null}
                employeeName={
                  previewWelcome.profile.fullName ?? previewWelcome.userName
                }
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id === "revenue" ? (
              <MobileRevenueScreen
                venue={previewVenue}
                overview={revenueOverview}
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id.startsWith("sentiment") ? (
              <MobileSentimentScreen
                tab={sentimentTabFromPageId(page.id)}
                venue={previewVenue}
                bundle={sentiment}
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id.startsWith("directory") ? (
              <MobileDirectoryScreen
                tab={directoryTabFromPageId(page.id)}
                venue={previewVenue}
                staff={directoryStaff}
                hierarchy={directoryHierarchy}
                onSelectTab={(tab) => {
                  if (tab.pageId) setPageId(tab.pageId);
                }}
              />
            ) : page.id === "terms" ? (
              <MobileTermsScreen
                venue={previewVenue}
                onBack={() => setPageId("welcome")}
              />
            ) : null}
          </div>
        }
      />
    </DevicePreviewStage>
  );
}

function PhoneChrome({
  device,
  page,
  screen,
  refreshing,
  onRefresh,
}: {
  device: DevicePreset;
  page: AppPathPage;
  screen: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const isIphone = device.brand === "iphone";
  const classic = device.island === "home-button";
  const screenRadius = classic ? 4 : device.cornerRadius;
  const bodyRadius = classic ? 36 : screenRadius + BEZEL;
  const extraBottom = classic ? HOME_BUTTON_EXTRA : 0;
  const insets = deviceSafeInsets(device);

  return (
    <div
      className="relative h-full w-full"
      role="region"
      aria-label={`${device.label} simulation, ${device.width} by ${device.height} CSS pixels, ${deviceRatioLabel(device.width, device.height)}`}
      style={{
        padding: BEZEL,
        paddingBottom: BEZEL + extraBottom,
        borderRadius: bodyRadius,
        background: isIphone
          ? "linear-gradient(160deg, #3a3a3c 0%, #1c1c1e 42%, #111113 100%)"
          : "linear-gradient(160deg, #2b2b2b 0%, #141414 48%, #0c0c0c 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset",
      }}
    >
      {isIphone ? <IphoneButtons /> : <SamsungButtons />}

      <div
        className="device-preview-screen relative h-full w-full overflow-hidden bg-[var(--venue-secondary,#F0F3DD)]"
        style={
          {
            borderRadius: screenRadius,
            "--mobile-safe-top": "0px",
            "--mobile-safe-bottom": `${insets.bottom}px`,
          } as CSSProperties
        }
      >
        <PhoneScreen
          page={page}
          screen={screen}
          insets={insets}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
        {device.island === "dynamic-island" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black"
            style={{ width: 126, height: 37 }}
          />
        ) : null}
        {device.island === "punch-hole" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-3 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-black"
          />
        ) : null}
        {device.island !== "home-button" ? (
          <div
            aria-hidden
            className={`pointer-events-none absolute bottom-2 left-1/2 z-10 h-[5px] w-[134px] -translate-x-1/2 rounded-full ${
              page.id === "login"
                ? "bg-white/40"
                : "bg-black/35 dark:bg-white/40"
            }`}
          />
        ) : null}
      </div>

      {classic ? (
        <div
          aria-hidden
          className="absolute bottom-[11px] left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white/15"
        >
          <span className="h-7 w-7 rounded-full border border-white/20" />
        </div>
      ) : null}
    </div>
  );
}

function PhoneScreen({
  page,
  screen,
  insets,
  refreshing,
  onRefresh,
}: {
  page: AppPathPage;
  screen: ReactNode;
  insets: { top: number; bottom: number };
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [chromeHost, setChromeHost] = useState<HTMLDivElement | null>(null);

  return (
    <div
      className={`absolute inset-0 ${
        page.id === "login"
          ? "bg-black"
          : page.id === "select-venue"
            ? "bg-[#E9E3D6]"
            : "bg-[Canvas]"
      }`}
    >
      <MobileChromeHostProvider host={chromeHost}>
        <MobileNavBusyProvider resetKey={page.id}>
          <div className="relative h-full min-h-0" data-mobile-shell="">
            <div
              className="h-full min-h-0"
              style={{ paddingTop: insets.top }}
            >
              <PullToRefresh
                refreshing={refreshing}
                onRefresh={onRefresh}
                className="h-full min-h-0"
                contentClassName="h-full min-h-0 overflow-hidden"
                indicatorInsetTop={10}
              >
                <DevicePreviewDensity
                  fill
                  density={
                    page.id === "login" ||
                    page.id === "select-venue" ||
                    page.id === "welcome"
                      ? COMPACT_PREVIEW_DENSITY
                      : undefined
                  }
                >
                  {screen}
                </DevicePreviewDensity>
              </PullToRefresh>
            </div>
            <div
              ref={setChromeHost}
              className="pointer-events-none absolute inset-x-0 bottom-0 z-50"
            />
            <MobilePageLoadingOverlay />
          </div>
        </MobileNavBusyProvider>
      </MobileChromeHostProvider>
    </div>
  );
}

function IphoneButtons() {
  return (
    <>
      <span
        aria-hidden
        className="absolute -left-[3px] top-[118px] h-7 w-[3px] rounded-l-sm bg-[#2c2c2e]"
      />
      <span
        aria-hidden
        className="absolute -left-[3px] top-[168px] h-14 w-[3px] rounded-l-sm bg-[#2c2c2e]"
      />
      <span
        aria-hidden
        className="absolute -left-[3px] top-[232px] h-14 w-[3px] rounded-l-sm bg-[#2c2c2e]"
      />
      <span
        aria-hidden
        className="absolute -right-[3px] top-[180px] h-[72px] w-[3px] rounded-r-sm bg-[#2c2c2e]"
      />
    </>
  );
}

function SamsungButtons() {
  return (
    <>
      <span
        aria-hidden
        className="absolute -left-[3px] top-[160px] h-12 w-[3px] rounded-l-sm bg-[#2a2a2a]"
      />
      <span
        aria-hidden
        className="absolute -right-[3px] top-[150px] h-16 w-[3px] rounded-r-sm bg-[#2a2a2a]"
      />
      <span
        aria-hidden
        className="absolute -right-[3px] top-[230px] h-10 w-[3px] rounded-r-sm bg-[#2a2a2a]"
      />
    </>
  );
}
