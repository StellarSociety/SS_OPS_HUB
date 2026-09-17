"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { ModuleTile } from "@/components/modules/module-tile";
import {
  MOBILE_PRESS_SCALE,
  MOBILE_PRESS_SCALE_SOFT,
  MOBILE_PRESS_TRANSITION,
  MOBILE_PRESS_TRANSITION_SOFT,
  MobilePressTarget,
  useMobilePress,
} from "@/components/mobile/mobile-press";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { signOut } from "@/lib/actions/auth";
import {
  moduleCategories,
  type ModuleCategoryKey,
} from "@/lib/module-categories";
import type { MobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { getUserInitials } from "@/lib/user/display";
import type { Venue } from "@/lib/types/database";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";

const LOGOUT_BUTTON_CLASS =
  "flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.03] py-2 text-[15px] font-medium text-[#3D421F] dark:border-white/12 dark:bg-white/[0.08] dark:text-[CanvasText]";

const WELCOME_CATEGORY_ORDER: ModuleCategoryKey[] = [
  "people",
  "operational",
  "revenue",
  "management",
];

const PEOPLE_MODULE_ORDER = ["directory", "learning", "hr"] as const;

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
  onOpenSentiment?: () => void;
  sentimentHref?: string;
  onOpenDirectory?: () => void;
  directoryHref?: string;
  onOpenTerms?: () => void;
  termsHref?: string;
  onLogout?: () => void;
};

export function MobileWelcomeScreen({
  venue,
  userName,
  modules,
  profile,
  onOpenProfile,
  profileHref,
  notificationCount = 0,
  onOpenNotifications,
  notificationsHref,
  onOpenRevenue,
  revenueHref,
  onOpenSentiment,
  sentimentHref,
  onOpenDirectory,
  directoryHref,
  onOpenTerms,
  termsHref,
  onLogout,
}: MobileWelcomeScreenProps) {
  const { beginNav } = useMobileNavBusy();
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;
  const hubTitle = venue.is_global
    ? "All Venues Operational HUB"
    : `${venue.name} Operational HUB`;
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const sections = useMemo(() => {
    const categoryByKey = new Map(
      moduleCategories.map((category) => [category.key, category]),
    );
    return WELCOME_CATEGORY_ORDER.map((key) => categoryByKey.get(key))
      .filter((category): category is NonNullable<typeof category> =>
        Boolean(category),
      )
      .map((category) => {
        const sectionModules = modules.filter(
          (mod) => mod.category === category.key,
        );
        if (category.key === "people") {
          sectionModules.sort((a, b) => {
            const aRank = PEOPLE_MODULE_ORDER.indexOf(
              a.key as (typeof PEOPLE_MODULE_ORDER)[number],
            );
            const bRank = PEOPLE_MODULE_ORDER.indexOf(
              b.key as (typeof PEOPLE_MODULE_ORDER)[number],
            );
            return (
              (aRank === -1 ? PEOPLE_MODULE_ORDER.length : aRank) -
              (bRank === -1 ? PEOPLE_MODULE_ORDER.length : bRank)
            );
          });
        }
        return { category, modules: sectionModules };
      })
      .filter((section) => section.modules.length > 0);
  }, [modules]);

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
      <header className="px-4 pb-2 pt-3 text-center">
        <VenueBrandIcon
          slug={venue.slug}
          name={venue.name}
          isGlobal={venue.is_global}
          primaryColor={venue.primary_color}
          logoUrl={venue.logo_url}
          iconUrl={venue.icon_url}
          faviconUrl={venue.favicon_url}
          variant="wordmark"
          className="mx-auto h-9 w-auto max-w-[168px]"
          title={venue.name}
        />
        <h1 className="mt-2 font-serif text-xl font-semibold leading-tight tracking-tight text-[#3D421F] dark:text-[CanvasText]">
          {firstName ? `Welcome back, ${firstName}` : "Welcome to the Hub"}
        </h1>
        <p className="mt-0.5 font-serif text-sm tracking-wide text-[#3D421F] dark:text-[CanvasText]">
          {hubTitle}
        </p>
        <p className="mx-auto mt-3 max-w-[20rem] text-[13px] leading-tight text-black/55 dark:text-white/55">
          Your operations command center for {venue.name}.
          <br />
          Choose the apps you want to start with.
        </p>
      </header>

      <div className="space-y-3 px-3 pb-6">
        <div className="flex items-stretch gap-2">
          <WelcomeProfileCard
            profile={profile}
            href={onOpenProfile ? undefined : profileHref}
            onOpen={onOpenProfile}
          />
          <WelcomeNotificationsCard
            totalCount={notificationCount}
            href={onOpenNotifications ? undefined : notificationsHref}
            onOpen={onOpenNotifications}
          />
        </div>

        <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/12 dark:bg-white/[0.08]">
          <div className="flex flex-col gap-y-2.5">
            {sections.map((section) => (
              <section key={section.category.key} className="flex flex-col gap-y-2">
                <h2 className="flex items-center gap-2 px-1 font-serif text-xs font-bold leading-none text-[#3D421F] dark:text-[CanvasText]">
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
                    const live =
                      mod.status === "live" &&
                      mod.clickable &&
                      mod.blockedReason !== "access";
                    const opensApp =
                      live && mod.key === "sales"
                        ? {
                            href: revenueHref,
                            onOpen: onOpenRevenue,
                            noun: "Revenue",
                          }
                        : live && mod.key === "sentiment"
                          ? {
                              href: sentimentHref,
                              onOpen: onOpenSentiment,
                              noun: "Sentiment",
                            }
                          : live && mod.key === "directory"
                            ? {
                                href: directoryHref,
                                onOpen: onOpenDirectory,
                                noun: "Directory",
                              }
                            : null;
                    const reservedToggle =
                      mod.key === "sales" ||
                      mod.key === "sentiment" ||
                      mod.key === "directory";
                    return (
                      <ModuleTile
                        key={mod.key}
                        label={mod.label}
                        iconKey={mod.iconKey}
                        status={mod.status}
                        href={opensApp?.href}
                        clickable={mod.clickable}
                        blockedReason={mod.blockedReason}
                        selected={
                          opensApp ? false : selectedKeys.includes(mod.key)
                        }
                        onSelect={
                          opensApp
                            ? opensApp.onOpen
                            : reservedToggle
                              ? undefined
                              : () => toggleApp(mod.key)
                        }
                        comingSoonStyle="none"
                        selectNoun={opensApp ? opensApp.noun : "starter apps"}
                        iconWell
                        density="compact"
                        navigates={Boolean(opensApp)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="space-y-2 px-1 pb-1">
          {onLogout ? (
            <MobilePressTarget
              type="button"
              onClick={onLogout}
              className={LOGOUT_BUTTON_CLASS}
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              Logout
            </MobilePressTarget>
          ) : (
            <form action={signOut}>
              <input type="hidden" name="mobile_app" value="1" />
              <MobilePressTarget type="submit" className={LOGOUT_BUTTON_CLASS}>
                <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
                Logout
              </MobilePressTarget>
            </form>
          )}
          <p className="text-center text-[11px] leading-relaxed text-black/50 dark:text-white/50">
            By using this hub you agree to follow Stellar Society policies for
            data, records, and workplace conduct. Misuse may result in access
            being revoked and disciplinary action, including dismissal.{" "}
            {onOpenTerms ? (
              <MobilePressTarget
                type="button"
                onClick={() => {
                  beginNav();
                  onOpenTerms();
                }}
                className="font-medium text-[#3D421F] underline underline-offset-2 dark:text-[CanvasText]"
              >
                Terms &amp; Conditions
              </MobilePressTarget>
            ) : termsHref ? (
              <WelcomeTermsLink href={termsHref} />
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

function WelcomeTermsLink({ href }: { href: string }) {
  const { pressed, pressProps } = useMobilePress();
  const { beginNav } = useMobileNavBusy();
  return (
    <motion.span
      className="inline-block"
      animate={{ scale: pressed ? MOBILE_PRESS_SCALE : 1 }}
      transition={MOBILE_PRESS_TRANSITION}
      {...pressProps}
    >
      <Link
        href={href}
        className="font-medium text-[#3D421F] underline underline-offset-2 dark:text-[CanvasText]"
        onClick={() => beginNav()}
      >
        Terms &amp; Conditions
      </Link>
    </motion.span>
  );
}

function WelcomeNotificationsCard({
  totalCount,
  href,
  onOpen,
}: {
  totalCount: number;
  href?: string;
  onOpen?: () => void;
}) {
  const { pressed, pressProps } = useMobilePress();
  const { beginNav } = useMobileNavBusy();
  const count = totalCount > 99 ? "99+" : String(totalCount);
  const label =
    totalCount === 1 ? "1 notification" : `${totalCount} notifications`;

  const row = (
    <motion.span
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/15 bg-[var(--venue-primary,#818a40)]/15 ring-1 ring-black/5"
        animate={{ scale: pressed ? MOBILE_PRESS_SCALE : 1 }}
        transition={MOBILE_PRESS_TRANSITION}
    >
      <Bell className="h-5 w-5 text-[#3D421F]" strokeWidth={1.75} aria-hidden />
      {totalCount > 0 ? (
        <span className="absolute -left-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-semibold tabular-nums leading-none text-white shadow-[0_1px_2px_rgba(80,0,20,0.35)] ring-2 ring-white">
          {count}
        </span>
      ) : null}
    </motion.span>
  );

  const controlClass =
    "flex h-full items-center justify-center rounded-lg px-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

  return (
    <section className="flex shrink-0 self-stretch rounded-xl border border-black/10 bg-black/[0.03] px-2 dark:border-white/12 dark:bg-white/[0.08]">
      {onOpen ? (
        <button
          type="button"
          onClick={() => {
            beginNav();
            onOpen();
          }}
          aria-label={label}
          className={controlClass}
          {...pressProps}
        >
          {row}
        </button>
      ) : href ? (
        <Link
          href={href}
          aria-label={label}
          className={controlClass}
          onClick={() => beginNav()}
          {...pressProps}
        >
          {row}
        </Link>
      ) : (
        <div className="flex items-center justify-center px-0.5" aria-label={label}>
          {row}
        </div>
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
  const { pressed, pressProps } = useMobilePress();
  const { beginNav } = useMobileNavBusy();

  const row = (
    <>
      {profile.avatarUrl ? (
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white shadow-sm ring-1 ring-black/10">
          <Image
            src={profile.avatarUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#3D421F] text-sm font-medium text-white">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-base leading-tight text-[#3D421F] dark:text-[CanvasText]">
          {displayName}
        </p>
        <p className="mt-0.5 truncate text-[11px] leading-snug text-black/50 dark:text-white/50">
          Personal Employee Hub
        </p>
      </div>
    </>
  );

  const inner = (
    <motion.span
      className="flex w-full items-center gap-2"
      animate={{ scale: pressed ? MOBILE_PRESS_SCALE_SOFT : 1 }}
      transition={MOBILE_PRESS_TRANSITION_SOFT}
    >
      {row}
    </motion.span>
  );

  return (
    <section className="min-w-0 flex-1 rounded-xl border border-black/10 bg-black/[0.03] px-2.5 py-3 dark:border-white/12 dark:bg-white/[0.08]">
      {onOpen ? (
        <button
          type="button"
          onClick={() => {
            beginNav();
            onOpen();
          }}
          className="flex w-full items-center gap-2 rounded-lg py-1.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          {...pressProps}
        >
          {inner}
        </button>
      ) : href ? (
        <Link
          href={href}
          className="flex items-center gap-2 rounded-lg py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          onClick={() => beginNav()}
          {...pressProps}
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-2 py-1.5">{row}</div>
      )}
    </section>
  );
}

