"use client";

import { useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";
import { DeviceNotificationsManager } from "@/components/pwa/device-notifications";
import {
  MobileNavBusyProvider,
  MobilePageLoadingOverlay,
} from "@/components/mobile/mobile-nav-busy";
import { cn } from "@/lib/utils";

export function MobileAppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshing, startRefresh] = useTransition();
  const selectVenue = pathname.includes("/select-venue");
  const login = pathname.includes("/login");

  return (
    <div
      className={cn(
        "relative h-dvh overflow-hidden",
        selectVenue && "bg-[#E9E3D6]",
        login && "bg-black",
      )}
    >
      <MobileNavBusyProvider resetKey={pathname}>
        <PullToRefresh
          refreshing={refreshing}
          onRefresh={() => startRefresh(() => router.refresh())}
          indicatorInsetTop="calc(var(--mobile-safe-top) + 10px)"
          contentClassName={cn(
            "h-full min-h-0",
            selectVenue || login ? "overflow-hidden" : "overflow-auto",
          )}
        >
          <div className="mobile-shell-inset h-full min-h-0">{children}</div>
        </PullToRefresh>
        <MobilePageLoadingOverlay />
        {selectVenue || login ? null : <DeviceNotificationsManager />}
      </MobileNavBusyProvider>
    </div>
  );
}
