"use client";

import { Bell, House, LogIn, MapPinned, ScrollText, TrendingUp, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RefreshSpinner } from "@/components/mobile/refresh-spinner";
import { cn } from "@/lib/utils";
import {
  APP_PATH,
  appPathPublicHref,
  getAppPathPage,
  type AppPathPage,
} from "@/lib/mobile/app-path";

const PATH_ICONS: Record<string, LucideIcon> = {
  login: LogIn,
  "select-venue": MapPinned,
  welcome: House,
  notifications: Bell,
  "employee-profile": UserRound,
  revenue: TrendingUp,
  terms: ScrollText,
};

type AppPathPanelProps = {
  selectedId: string;
  onSelect: (id: string) => void;
  venue: { slug: string };
  onRefreshPreview?: () => void;
  refreshing?: boolean;
};

export function AppPathPanel({
  selectedId,
  onSelect,
  venue,
  onRefreshPreview,
  refreshing = false,
}: AppPathPanelProps) {
  const current = getAppPathPage(selectedId);
  const currentHref = appPathPublicHref(current, venue);
  const stem = APP_PATH.filter((page) => !page.from);
  const branches = APP_PATH.filter((page) => page.from === "welcome");

  return (
    <Card className="relative flex h-full min-h-0 min-w-[16rem] flex-1 flex-col p-4">
      {onRefreshPreview ? (
        <button
          type="button"
          aria-label="Refresh mobile preview"
          aria-busy={refreshing}
          disabled={refreshing}
          onClick={onRefreshPreview}
          className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[#3D421F] hover:bg-black/[0.06] disabled:opacity-70"
        >
          <RefreshSpinner size={16} spinning={refreshing} progress={0.72} />
        </button>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 items-baseline gap-3",
          onRefreshPreview && "pl-9",
        )}
      >
        <p className="shrink-0 font-serif text-xl text-[#3D421F]">App Path</p>
        <p className="min-w-0 truncate font-mono text-[11px] text-black/40">
          {currentHref}
        </p>
      </div>
      <hr className="mt-3 border-black/10" />

      <nav
        aria-label="App path"
        className="mt-4 flex min-h-0 flex-1 flex-col justify-start"
      >
        {stem.map((item, index) => {
          const lastStem = index === stem.length - 1;
          return (
            <div key={item.id} className="flex shrink-0 flex-col">
              <PathNode
                page={item}
                index={APP_PATH.indexOf(item)}
                active={selectedId === item.id}
                onSelect={onSelect}
                href={appPathPublicHref(item, venue)}
              />
              {lastStem ? (
                <BranchFork
                  branches={branches}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  venue={venue}
                />
              ) : (
                <span
                  aria-hidden
                  className="ml-[17px] h-5 w-0.5 shrink-0 rounded-full bg-[var(--venue-primary,#818a40)]/30"
                />
              )}
            </div>
          );
        })}
      </nav>
    </Card>
  );
}

function BranchFork({
  branches,
  selectedId,
  onSelect,
  venue,
}: {
  branches: AppPathPage[];
  selectedId: string;
  onSelect: (id: string) => void;
  venue: { slug: string };
}) {
  if (branches.length === 0) return null;

  return (
    <div className="flex shrink-0">
      <div className="relative w-9 shrink-0">
        <span
          aria-hidden
          className="absolute bottom-5 left-1/2 top-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--venue-primary,#818a40)]/30"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        {branches.map((item) => (
          <div key={item.id} className="relative flex w-full shrink-0 items-start">
            <span
              aria-hidden
              className="absolute left-[-18px] top-[18px] h-0.5 w-[18px] rounded-full bg-[var(--venue-primary,#818a40)]/30"
            />
            <PathNode
              page={item}
              index={APP_PATH.indexOf(item)}
              active={selectedId === item.id}
              onSelect={onSelect}
              compact
              href={appPathPublicHref(item, venue)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PathNode({
  page,
  index,
  active,
  onSelect,
  href,
  compact = false,
}: {
  page: AppPathPage;
  index: number;
  active: boolean;
  onSelect: (id: string) => void;
  href: string;
  compact?: boolean;
}) {
  const Icon = PATH_ICONS[page.id];

  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(page.id)}
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 rounded-2xl text-left transition-colors",
        compact ? "py-1 pr-1" : "py-0.5 pr-1",
        "hover:bg-[var(--venue-primary,#818a40)]/8",
      )}
    >
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full",
          compact ? "h-9 w-9" : "h-9 w-9",
          active
            ? "bg-[var(--venue-primary,#818a40)] text-white shadow-[0_0_0_4px_rgb(129_138_64_/_0.22)]"
            : "bg-[var(--venue-primary,#818a40)]/12 text-[#3D421F]/70",
        )}
      >
        {Icon ? (
          <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
        ) : (
          <span className="text-[11px] font-semibold">{index + 1}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline justify-between gap-2">
          <span
            className={cn(
              "min-w-0 truncate font-nav text-sm text-[#3D421F]",
              active ? "font-semibold" : "font-medium",
            )}
          >
            {page.label}
          </span>
          <span className="max-w-[50%] shrink-0 truncate text-right font-mono text-[10px] text-black/40">
            {href}
          </span>
        </span>
        {active ? (
          <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-[var(--venue-primary,#818a40)]">
            You are here
          </span>
        ) : null}
      </span>
    </button>
  );
}
