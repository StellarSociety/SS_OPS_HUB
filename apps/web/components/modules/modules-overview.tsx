"use client";

import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { AppsHubStage } from "@/components/modules/apps-hub-stage";
import type {
  AppModuleState,
  ModuleCategory,
  ModuleOverviewItem,
} from "@/lib/modules-registry";
import type { Venue } from "@/lib/types/database";

export type ModuleGridItem = Omit<ModuleOverviewItem, "status"> & {
  status: AppModuleState;
  clickable: boolean;
  /** Why the tile can't be opened, when it isn't clickable. "access" means the
   * app is live and enabled but the user lacks permission. */
  blockedReason?: "access" | null;
};

export type ModulesOverviewSection = {
  category: ModuleCategory;
  modules: ModuleGridItem[];
};

type ModulesOverviewProps = {
  venue: Venue;
  isGlobal?: boolean;
  userName?: string | null;
  sections: ModulesOverviewSection[];
  trailingItem?: ModuleGridItem | null;
};

export function ModulesOverview({
  venue,
  isGlobal = false,
  userName,
  sections,
  trailingItem,
}: ModulesOverviewProps) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;
  const hubTitle = venue.is_global
    ? "All Venues Operational HUB"
    : `${venue.name} Operational HUB`;
  return (
    <div className="space-y-8">
      <header className="flex flex-col items-center gap-3 pb-2 pt-6 text-center md:pt-10">
        <VenueBrandIcon
          slug={venue.slug}
          name={venue.name}
          isGlobal={venue.is_global}
          primaryColor={venue.primary_color}
          logoUrl={venue.logo_url}
          iconUrl={venue.icon_url}
          faviconUrl={venue.favicon_url}
          variant="mark"
          className="h-16 w-16 md:h-20 md:w-20"
          title={venue.name}
        />

        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#3D421F] md:text-4xl">
          {firstName
            ? `Welcome back, ${firstName}`
            : isGlobal
              ? "App Settings"
              : "Welcome to the Hub"}
        </h1>

        <p className="font-serif text-2xl tracking-wide text-[#3D421F] md:text-3xl">
          {hubTitle}
        </p>

        {isGlobal ? (
          <p className="max-w-xl text-sm text-black/55 md:text-base">
            Select an app to manage its settings across every venue.
          </p>
        ) : (
          <p className="max-w-xl text-sm text-black/55 md:text-base">
            Your operations command center for {venue.name}. Pick a category
            below to jump into dashboards, operational, revenue, people, and
            management apps. Every app in the {venue.name} suite. Select one to
            open it.
          </p>
        )}
        <hr className="mt-4 w-full border-black/10" />
      </header>

      <AppsHubStage sections={sections} trailingItem={trailingItem} />
    </div>
  );
}
