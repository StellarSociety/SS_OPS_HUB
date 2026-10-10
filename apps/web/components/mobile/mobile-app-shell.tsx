"use client";

import { useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EdgeSwipeBack } from "@/components/mobile/edge-swipe-back";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";
import { DeviceNotificationsManager } from "@/components/pwa/device-notifications";
import { MobileAppInstallReporter } from "@/components/pwa/mobile-app-install-reporter";
import { MobileAppUsageReporter } from "@/components/pwa/mobile-app-usage-reporter";
import { MobileChromeHostProvider } from "@/components/mobile/mobile-chrome-host";
import {
  MobileNavBusyProvider,
  MobilePageLoadingOverlay,
} from "@/components/mobile/mobile-nav-busy";
import { cn } from "@/lib/utils";

export function MobileAppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshing, startRefresh] = useTransition();
  const [chromeHost, setChromeHost] = useState<HTMLDivElement | null>(null);
  const selectVenue = pathname.includes("/select-venue");
  const login = pathname.includes("/login");

  // Edge swipe: back through history, or Home when there is nothing to go back to.
  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    const slug = /^\/m\/([^/]+)/.exec(pathname)?.[1];
    if (slug && !pathname.endsWith("/welcome")) router.push(`/m/${slug}/welcome`);
  }

  return (
    <div
      className={cn(
        "mobile-app-frame overflow-hidden",
        selectVenue && "bg-[#E9E3D6]",
        login && "bg-black",
      )}
    >
      <MobileChromeHostProvider host={chromeHost}>
        <MobileNavBusyProvider resetKey={pathname}>
          <div className="relative h-full min-h-0" data-mobile-shell="">
            <EdgeSwipeBack
              onBack={goBack}
              disabled={login || selectVenue}
              className="mobile-shell-inset h-full min-h-0"
            >
              <PullToRefresh
                refreshing={refreshing}
                onRefresh={() => startRefresh(() => router.refresh())}
                indicatorInsetTop={10}
                className="h-full min-h-0"
                contentClassName="h-full min-h-0 overflow-hidden"
              >
                {children}
              </PullToRefresh>
            </EdgeSwipeBack>
            <div
              ref={setChromeHost}
              className="pointer-events-none absolute inset-x-0 bottom-0 z-50"
            />
          </div>
          <MobilePageLoadingOverlay />
          {selectVenue || login ? null : <DeviceNotificationsManager />}
          {login ? null : <MobileAppInstallReporter />}
          {login ? null : <MobileAppUsageReporter />}
        </MobileNavBusyProvider>
      </MobileChromeHostProvider>
    </div>
  );
}
