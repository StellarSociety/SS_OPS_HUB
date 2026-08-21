"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LoginScreen } from "@/components/auth/login-screen";
import { AppPathPanel } from "@/components/mobile/app-path-panel";
import { MobileEmployeeProfileScreen } from "@/components/mobile/mobile-employee-profile-screen";
import { MobileLanHostButton } from "@/components/mobile/mobile-lan-host-button";
import { MobileNotificationsScreen } from "@/components/mobile/mobile-notifications-screen";
import { MobileRevenueScreen } from "@/components/mobile/mobile-revenue-screen";
import { MobileTermsScreen } from "@/components/mobile/mobile-terms-screen";
import { MobileWelcomeScreen } from "@/components/mobile/mobile-welcome-screen";
import { SelectVenueScreen } from "@/components/venue/select-venue-screen";
import {
  APP_PATH,
  appPathPublicHref,
  getAppPathPage,
  type AppPathPage,
} from "@/lib/mobile/app-path";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import type { MobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import type { NotificationRow } from "@/lib/notifications/types";
import type { SelectVenuePageData } from "@/lib/venue/select-venue-page-data";
import type { SalesOverviewResult } from "@/lib/sales/sales-overview-data";
import type { Venue } from "@/lib/types/database";
import {
  DEFAULT_DEVICE_ID,
  DEVICE_BRANDS,
  deviceRatioLabel,
  devicesForBrand,
  getDevicePreset,
  type DeviceBrand,
  type DevicePreset,
} from "@/lib/mobile/device-presets";

const SELECT_CLASS =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";
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

/** CSS scale makes browsers scroll to the unscaled field box — keep the preview still. */
function keepPreviewScrollStill(event: FocusEvent<HTMLDivElement>) {
  const ancestors: HTMLElement[] = [];
  let node: HTMLElement | null = event.currentTarget.parentElement;
  while (node) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowX) || /(auto|scroll)/.test(overflowY)) {
      ancestors.push(node);
    }
    node = node.parentElement;
  }
  const saved = ancestors.map((el) => ({
    el,
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
  const winX = window.scrollX;
  const winY = window.scrollY;
  requestAnimationFrame(() => {
    for (const item of saved) {
      item.el.scrollTop = item.top;
      item.el.scrollLeft = item.left;
    }
    window.scrollTo(winX, winY);
  });
}

export function DeviceSimulator({
  loginLogoUrl,
  selectVenue,
  welcome,
  revenueOverview,
}: {
  loginLogoUrl: string;
  selectVenue: SelectVenuePageData;
  welcome: WelcomePreview;
  revenueOverview: SalesOverviewResult;
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 pb-4">
        <div>
          <p className="font-serif text-2xl text-[#3D421F]">Device preview</p>
          <hr className="mt-4 w-full border-black/10" />
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-start gap-3">
            <label className="flex min-w-[12rem] flex-col gap-1">
              <span className="text-[11px] font-medium text-black/45">
                Format
              </span>
              <select
                value={brand}
                onChange={(event) =>
                  selectBrand(event.target.value as DeviceBrand)
                }
                className={SELECT_CLASS}
              >
                {DEVICE_BRANDS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-medium text-black/45">
                Model
              </span>
              <div className="flex h-10 min-w-0 items-center gap-3">
                <select
                  aria-label="Phone model"
                  value={device.id}
                  onChange={(event) => setDeviceId(event.target.value)}
                  className={`${SELECT_CLASS} min-w-[12rem]`}
                >
                  {brandDevices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="shrink-0 text-sm tabular-nums text-black/50">
                  {device.label}
                  <span className="mx-1.5 text-black/20">·</span>
                  {device.width} × {device.height}
                  <span className="mx-1.5 text-black/20">·</span>
                  {ratio}
                  <span className="mx-1.5 text-black/20">·</span>
                  {device.dpr}×
                </p>
              </div>
            </div>
          </div>
        </Card>

        <MobileLanHostButton previewPath={previewPath} />
      </div>

      <PhoneStage
        device={device}
        loginLogoUrl={loginLogoUrl}
        selectVenue={selectVenue}
        welcome={welcome}
        revenueOverview={revenueOverview}
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
  pageId: string;
  setPageId: (id: string) => void;
  previewVenue: Venue;
  setPreviewVenue: (venue: Venue) => void;
}) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const frame = frameSize(device);
  const page = getAppPathPage(pageId);

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

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const availableWidth = stage.clientWidth;
      const availableHeight = stage.clientHeight;
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const pathMin = 18 * 16;
      const gap = 24;
      const next = Math.min(
        1,
        availableHeight / frame.height,
        Math.max(0.2, (availableWidth - pathMin - gap) / frame.width),
      );
      setScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [frame.width, frame.height]);

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 items-stretch gap-6 overflow-hidden"
    >
      <div
        className="relative shrink-0 self-start overflow-hidden"
        style={{
          width: frame.width * scale,
          height: frame.height * scale,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: frame.width,
            height: frame.height,
            transform: `scale(${scale})`,
          }}
          onFocusCapture={keepPreviewScrollStill}
        >
          <PhoneChrome
            device={device}
            page={page}
            screen={
              page.id === "login" ? (
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
                  onSelectVenue={handleVenueSelected}
                />
              ) : page.id === "welcome" ? (
                <MobileWelcomeScreen
                  venue={previewVenue}
                  userName={welcome.userName}
                  modules={welcome.modules}
                  profile={welcome.profile}
                  onOpenProfile={() => setPageId("employee-profile")}
                  notificationCount={welcome.notificationCount}
                  unreadCount={welcome.unreadCount}
                  onOpenNotifications={() => setPageId("notifications")}
                  onOpenRevenue={() => setPageId("revenue")}
                  onOpenTerms={() => setPageId("terms")}
                />
              ) : page.id === "notifications" ? (
                <MobileNotificationsScreen
                  venue={previewVenue}
                  notifications={welcome.notifications}
                  onSelectTab={(tab) => {
                    if (tab.pageId) setPageId(tab.pageId);
                  }}
                />
              ) : page.id === "employee-profile" ? (
                <MobileEmployeeProfileScreen
                  venue={previewVenue}
                  profile={welcome.profile}
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
              ) : page.id === "terms" ? (
                <MobileTermsScreen
                  venue={previewVenue}
                  onBack={() => setPageId("welcome")}
                />
              ) : null
            }
          />
        </div>
      </div>

      <AppPathPanel
        selectedId={pageId}
        onSelect={setPageId}
        venue={previewVenue}
      />
    </div>
  );
}

function PhoneChrome({
  device,
  page,
  screen,
}: {
  device: DevicePreset;
  page: AppPathPage;
  screen: ReactNode;
}) {
  const isIphone = device.brand === "iphone";
  const classic = device.island === "home-button";
  const screenRadius = classic ? 4 : device.cornerRadius;
  const bodyRadius = classic ? 36 : screenRadius + BEZEL;
  const extraBottom = classic ? HOME_BUTTON_EXTRA : 0;

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
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.18) inset, 0 24px 48px -20px rgba(0,0,0,0.45), 0 8px 16px -8px rgba(0,0,0,0.3)",
      }}
    >
      {isIphone ? <IphoneButtons /> : <SamsungButtons />}

      <div
        className="relative h-full w-full overflow-hidden bg-[var(--venue-secondary,#F0F3DD)]"
        style={{ borderRadius: screenRadius }}
      >
        <div
          className={`absolute inset-0 ${
            page.id === "login" ||
            page.id === "employee-profile" ||
            page.id === "notifications" ||
            page.id === "revenue" ||
            page.id === "terms"
              ? "overflow-hidden"
              : "overflow-auto"
          } ${
            page.id === "login"
              ? "bg-black"
              : page.id === "welcome" ||
                  page.id === "employee-profile" ||
                  page.id === "notifications" ||
                  page.id === "revenue" ||
                  page.id === "terms"
                ? "bg-[Canvas]"
                : "bg-[#E9E3D6]"
          }`}
        >
          {screen}
        </div>
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
