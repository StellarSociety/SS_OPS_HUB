"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { ModuleTile } from "@/components/modules/module-tile";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { moduleCategories } from "@/lib/module-categories";
import type { MobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { getUserInitials } from "@/lib/user/display";
import type { Venue } from "@/lib/types/database";

type MobileWelcomeScreenProps = {
  venue: Venue;
  userName?: string | null;
  modules: ModuleGridItem[];
  profile: MobileWelcomeProfile;
  onOpenProfile?: () => void;
  profileHref?: string;
  notificationCount?: number;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  notificationsHref?: string;
  onOpenRevenue?: () => void;
  revenueHref?: string;
  onOpenTerms?: () => void;
  termsHref?: string;
};

export function MobileWelcomeScreen({
  venue,
  userName,
  modules,
  profile,
  onOpenProfile,
  profileHref,
  notificationCount = 0,
  unreadCount = 0,
  onOpenNotifications,
  notificationsHref,
  onOpenRevenue,
  revenueHref,
  onOpenTerms,
  termsHref,
}: MobileWelcomeScreenProps) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const sections = useMemo(
    () =>
      moduleCategories
        .map((category) => ({
          category,
          modules: modules.filter((mod) => mod.category === category.key),
        }))
        .filter((section) => section.modules.length > 0),
    [modules],
  );

  function toggleApp(key: string) {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  return (
    <div
      className="mobile-app-canvas"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <header className="px-4 pb-3 pt-14 text-center">
        <VenueBrandIcon
          slug={venue.slug}
          name={venue.name}
          isGlobal={venue.is_global}
          primaryColor={venue.primary_color}
          logoUrl={venue.logo_url}
          iconUrl={venue.icon_url}
          faviconUrl={venue.favicon_url}
          variant="wordmark"
          className="mx-auto h-12 w-auto max-w-[220px]"
          title={venue.name}
        />
        <h1 className="mt-3 font-serif text-[1.65rem] font-semibold leading-tight tracking-tight text-[#3D421F] dark:text-[CanvasText]">
          {firstName ? `Welcome back, ${firstName}` : "Welcome to the Hub"}
        </h1>
        <p className="mt-1 font-serif text-lg tracking-wide text-[#3D421F] dark:text-[CanvasText]">
          Operational Apps Hub
        </p>
        <p className="mx-auto mt-2 max-w-[20rem] text-[13px] leading-relaxed text-black/55 dark:text-white/55">
          Your operations command center for {venue.name}.
          <br />
          Choose the apps you want to start with.
        </p>
      </header>

      <div className="space-y-3 px-3 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <WelcomeProfileCard
            profile={profile}
            href={onOpenProfile ? undefined : profileHref}
            onOpen={onOpenProfile}
          />
          <WelcomeNotificationsCard
            totalCount={notificationCount}
            unreadCount={unreadCount}
            href={onOpenNotifications ? undefined : notificationsHref}
            onOpen={onOpenNotifications}
          />
        </div>

        <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/12 dark:bg-white/[0.08]">
          <div className="flex flex-col gap-y-2.5">
            {sections.map((section) => (
              <section key={section.category.key} className="flex flex-col gap-y-1">
                <h2 className="flex items-center gap-2 px-1 font-serif text-base leading-none text-[#3D421F] dark:text-[CanvasText]">
                  <span
                    aria-hidden
                    className="h-px min-w-0 flex-1 bg-[#3D421F]/25 dark:bg-white/25"
                  />
                  <span className="shrink-0 py-0.5">{section.category.label}</span>
                  <span
                    aria-hidden
                    className="h-px min-w-0 flex-1 bg-[#3D421F]/25 dark:bg-white/25"
                  />
                </h2>
                <div className="grid grid-cols-4 items-start justify-items-center gap-x-1 gap-y-1.5">
                  {section.modules.map((mod) => {
                    const opensRevenue =
                      mod.key === "sales" &&
                      mod.status === "live" &&
                      mod.clickable &&
                      mod.blockedReason !== "access";
                    return (
                      <ModuleTile
                        key={mod.key}
                        label={mod.label}
                        iconKey={mod.iconKey}
                        status={mod.status}
                        href={opensRevenue ? revenueHref : undefined}
                        clickable={mod.clickable}
                        blockedReason={mod.blockedReason}
                        selected={
                          opensRevenue ? false : selectedKeys.includes(mod.key)
                        }
                        onSelect={
                          opensRevenue
                            ? onOpenRevenue
                            : mod.key === "sales"
                              ? undefined
                              : () => toggleApp(mod.key)
                        }
                        comingSoonStyle="none"
                        selectNoun={opensRevenue ? "Revenue" : "starter apps"}
                        iconWell
                        density="compact"
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 px-1 pb-1">
          <p className="text-center text-[11px] leading-relaxed text-black/50 dark:text-white/50">
            By using this hub you agree to follow Stellar Society policies for
            data, records, and workplace conduct. Misuse may result in access
            being revoked and disciplinary action, including dismissal.
          </p>
          {onOpenTerms ? (
            <button
              type="button"
              onClick={onOpenTerms}
              className="block w-full text-center text-[11px] font-medium text-[#3D421F] underline underline-offset-2 dark:text-[CanvasText]"
            >
              Terms &amp; Conditions
            </button>
          ) : termsHref ? (
            <Link
              href={termsHref}
              className="block w-full text-center text-[11px] font-medium text-[#3D421F] underline underline-offset-2 dark:text-[CanvasText]"
            >
              Terms &amp; Conditions
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WelcomeNotificationsCard({
  totalCount,
  unreadCount,
  href,
  onOpen,
}: {
  totalCount: number;
  unreadCount: number;
  href?: string;
  onOpen?: () => void;
}) {
  const countLabel =
    totalCount === 1 ? "1 notification" : `${totalCount} notifications`;
  const unreadLabel =
    unreadCount === 0
      ? "You're all caught up"
      : unreadCount === 1
        ? "1 unread"
        : `${unreadCount} unread`;

  const row = (
    <>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F] dark:text-[CanvasText]">
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] px-1 text-[9px] font-semibold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-sm leading-tight text-[#3D421F] dark:text-[CanvasText]">
          {countLabel}
        </p>
        <p className="mt-0.5 truncate text-[10px] leading-snug text-black/50 dark:text-white/50">
          {unreadLabel}
        </p>
      </div>
    </>
  );

  return (
    <section className="min-w-0 rounded-xl border border-black/10 bg-black/[0.03] px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.08]">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-1.5 rounded-lg py-0.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          {row}
        </button>
      ) : href ? (
        <Link
          href={href}
          className="flex items-center gap-1.5 rounded-lg py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          {row}
        </Link>
      ) : (
        <div className="flex items-center gap-1.5 py-0.5">{row}</div>
      )}
    </section>
  );
}

function WelcomeProfileCard({
  profile,
  href,
  onOpen,
}: {
  profile: MobileWelcomeProfile;
  href?: string;
  onOpen?: () => void;
}) {
  const displayName = profile.fullName?.trim() || profile.email || "Profile";
  const initials = getUserInitials(profile.fullName, profile.email);

  const row = (
    <>
      {profile.avatarUrl ? (
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white shadow-sm ring-1 ring-black/10">
          <Image
            src={profile.avatarUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3D421F] text-[11px] font-medium text-white">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-sm leading-tight text-[#3D421F] dark:text-[CanvasText]">
          {displayName}
        </p>
        <p className="mt-0.5 truncate text-[10px] leading-snug text-black/50 dark:text-white/50">
          Employee Hub
        </p>
      </div>
    </>
  );

  return (
    <section className="min-w-0 rounded-xl border border-black/10 bg-black/[0.03] px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.08]">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-1.5 rounded-lg py-0.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          {row}
        </button>
      ) : href ? (
        <Link
          href={href}
          className="flex items-center gap-1.5 rounded-lg py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          {row}
        </Link>
      ) : (
        <div className="flex items-center gap-1.5 py-0.5">{row}</div>
      )}
    </section>
  );
}

