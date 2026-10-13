"use client";

import { useEffect, useState, useTransition } from "react";
import { Smartphone } from "lucide-react";
import { ModuleIcon } from "@/components/modules/module-icon";
import { Card } from "@/components/ui/card";
import { AccessLevelSwitch } from "@/components/ui/access-level-switch";
import { toast } from "@/components/ui/toast";
import {
  isPhoneAppBuilt,
  phoneLevelForDisplay,
  phoneLevelsFor,
} from "@/lib/access/phone-levels";
import type { AccessMatrixLevel, AccessMatrixAppColumn } from "@/lib/access/matrix";
import {
  getPhoneAccessState,
  setPhoneAccess,
  type PhoneAccessState,
} from "@/lib/actions/phone-access";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type HubPage = { key: string; label: string };

type Props = {
  userId: string;
  venues: Venue[];
  defaultVenueId: string | null;
  apps: (AccessMatrixAppColumn & { iconKey?: string })[];
  hubPages: HubPage[];
  switchKey: string;
  hubKey: string;
};

/**
 * Phone access for one person — the same switches as Mobile App → Users
 * Access, kept apart from web app access. Each change saves straight away.
 */
export function MobileAppAccessCard({
  userId,
  venues,
  defaultVenueId,
  apps,
  hubPages,
  switchKey,
  hubKey,
}: Props) {
  const realVenues = venues.filter((venue) => !venue.is_global);
  const [venueId, setVenueId] = useState(
    defaultVenueId && realVenues.some((venue) => venue.id === defaultVenueId)
      ? defaultVenueId
      : (realVenues[0]?.id ?? ""),
  );
  // Switches for the venue they were loaded for; a different venue = loading.
  const [loaded, setLoaded] = useState<{
    venueId: string;
    state: PhoneAccessState;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const loading = loaded?.venueId !== venueId;
  const state = loading ? null : loaded.state;

  function setState(
    next: PhoneAccessState | ((current: PhoneAccessState | null) => PhoneAccessState | null),
  ) {
    setLoaded((current) => {
      if (!current) return current;
      const value = typeof next === "function" ? next(current.state) : next;
      return value ? { venueId: current.venueId, state: value } : current;
    });
  }

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    getPhoneAccessState({ userId, venueId })
      .then((next) => {
        if (!cancelled) setLoaded({ venueId, state: next });
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load mobile access.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, venueId]);

  function save(appKey: string, level: AccessMatrixLevel, pages?: string[]) {
    if (!state) return;
    const previous = state;
    const nextLevels = { ...state.levels, [appKey]: level };
    setState({
      ...state,
      levels: nextLevels,
      canUseApp:
        appKey === switchKey
          ? level === "viewer" || level === "editor"
          : state.canUseApp,
      hubPages: pages ?? state.hubPages,
    });
    startTransition(async () => {
      const result = await setPhoneAccess({ userId, venueId, appKey, level, pages });
      if (result.error) {
        setState(previous);
        toast.error(result.error);
        return;
      }
      if (result.switchedOn) {
        setState((current) =>
          current
            ? {
                ...current,
                canUseApp: true,
                levels: { ...current.levels, [switchKey]: "viewer" },
              }
            : current,
        );
      }
      if (result.success) toast.saved(result.success);
    });
  }

  function toggleHubPage(page: string) {
    if (!state) return;
    const pages = state.hubPages.includes(page)
      ? state.hubPages.filter((key) => key !== page)
      : [...state.hubPages, page];
    const hubLevel = state.levels[hubKey] ?? "none";
    save(hubKey, hubLevel === "hidden" || hubLevel === "none" ? "viewer" : hubLevel, pages);
  }

  const hubLevel = state?.levels[hubKey] ?? "none";
  const hubOn = hubLevel === "viewer" || hubLevel === "editor";
  const disabled = loading || !state;

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 text-[#818a40]" />
          <div>
            <h2 className="font-serif text-xl text-[#3D421F]">Mobile App Access</h2>
            <p className="mt-1 text-sm text-black/60">
              What this person gets on the phone. Separate from web app access
              above; changes save straight away.
            </p>
          </div>
        </div>
        {realVenues.length > 1 ? (
          <label className="space-y-1 text-xs">
            <span className="text-black/50">Venue</span>
            <select
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              className="h-10 w-48 rounded-md border border-black/10 px-2 text-sm"
            >
              {realVenues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3",
          state?.canUseApp
            ? "border-[#818a40]/40 bg-white"
            : "border-black/10 bg-black/[0.015]",
        )}
      >
        <label
          className={cn(
            "relative inline-flex items-center",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          )}
        >
          <input
            type="checkbox"
            className="peer sr-only"
            aria-label="Can use the mobile app"
            checked={Boolean(state?.canUseApp)}
            disabled={disabled || isPending}
            onChange={(event) =>
              save(switchKey, event.target.checked ? "viewer" : "none")
            }
          />
          <span className="h-5 w-9 rounded-full bg-black/20 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#818a40] peer-checked:after:translate-x-4" />
        </label>
        <div>
          <p className="font-medium text-[#3D421F]">Can use the mobile app</p>
          <p className="text-xs text-black/50">
            {state?.canUseApp
              ? "They can sign in on the phone at this venue."
              : "Off — they see “No access” on the phone, whatever is set below."}
          </p>
        </div>
      </div>

      <div className={cn("space-y-3", !state?.canUseApp && "opacity-60")}>
        <div className="rounded-lg border border-black/10 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="block font-medium text-[#3D421F]">Personal Employee Hub</span>
              <span className="block text-[11px] text-black/50">
                Viewer — view only. Editor — can also apply for, edit and cancel leave.
              </span>
            </span>
            <AccessLevelSwitch
              name="Personal Employee Hub"
              value={hubLevel}
              disabled={disabled || isPending}
              onChange={(level) => save(hubKey, level)}
            />
          </div>
          {hubOn ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-black/5 pt-3">
              {hubPages.map((page) => (
                <label
                  key={page.key}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-black/10 px-2.5 py-1.5 text-sm text-[#3D421F]"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(state?.hubPages.includes(page.key))}
                    disabled={disabled || isPending}
                    onChange={() => toggleHubPage(page.key)}
                    className="h-4 w-4 rounded border-black/20 accent-[#818a40]"
                  />
                  {page.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
          {apps.map((app) => (
            <div
              key={app.key}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-[#3D421F]">
                {app.iconKey ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--venue-secondary)]/60">
                    <ModuleIcon iconKey={app.iconKey} className="h-4 w-4" />
                  </span>
                ) : null}
                {app.label}
                <span className="text-[11px] text-black/40">{app.category}</span>
                {isPhoneAppBuilt(app.key) ? null : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                    Coming soon
                  </span>
                )}
              </span>
              <AccessLevelSwitch
                name={app.label}
                levels={phoneLevelsFor(app.key)}
                value={phoneLevelForDisplay(app.key, state?.levels[app.key] ?? "none")}
                disabled={disabled || isPending}
                onChange={(level) => save(app.key, level)}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-black/45">
          Hidden — not shown on their phone. No access — shown faded in their
          Hidden apps. Viewer / On — opens on the phone. Editor — can also
          change things (Connecteam: send messages, post, call).
        </p>
      </div>
    </Card>
  );
}
