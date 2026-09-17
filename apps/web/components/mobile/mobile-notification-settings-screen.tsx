"use client";

import type { CSSProperties } from "react";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { DeviceNotificationSettingsCard } from "@/components/pwa/device-notifications";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";

type MobileNotificationSettingsScreenProps = {
  venue: Venue;
  onSelectTab?: (tab: MobileTabItem) => void;
};

export function MobileNotificationSettingsScreen({
  venue,
  onSelectTab,
}: MobileNotificationSettingsScreenProps) {
  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
          Notification settings
        </h1>
        <p className="mt-1 text-center text-sm text-black/50 dark:text-white/50">
          Lock-screen alerts for this phone
        </p>
        <hr className="mt-3 border-black/10 dark:border-white/12" />
        <DeviceNotificationSettingsCard className="mt-4" />
      </div>

      <MobileTabBar
        app="notifications"
        activeId="settings"
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}
