"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftRight,
  Bell,
  ChevronDown,
  Lock,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { cn } from "@/lib/utils";
import { isPhoneAppBuilt } from "@/lib/access/phone-levels";
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
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import {
  HIRING_SHORTCUT_KEY,
  isShortcutOpen,
  type WelcomeShortcut,
} from "@/lib/mobile/shortcuts";
import {
  moduleCategories,
  type ModuleCategoryKey,
} from "@/lib/module-categories";
import type { AccessMatrixLevel } from "@/lib/access/matrix";
import type { MobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import { getUserInitials } from "@/lib/user/display";
import type { Venue } from "@/lib/types/database";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";

const LOGOUT_BUTTON_CLASS =
  "flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.03] text-[15px] font-medium text-[#3D421F] dark:border-white/12 dark:bg-white/[0.08] dark:text-[CanvasText]";

const WELCOME_CATEGORY_ORDER: ModuleCategoryKey[] = [
  "people",
  "operational",
  "revenue",
  "management",
];

const PEOPLE_MODULE_ORDER = ["directory", "learning", "hr"] as const;

type WelcomeSection = {
  category: (typeof moduleCategories)[number];
  modules: ModuleGridItem[];
  shortcuts: WelcomeShortcut[];
};

/** Apps the user can't open go in the collapsed "Hidden" section. */
function isNoAccessModule(mod: ModuleGridItem) {
  return mod.blockedReason === "access" || mod.status === "visible_locked";
}

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
  onOpenConnect?: () => void;
  connectHref?: string;
  onOpenRevenue?: () => void;
  revenueHref?: string;
  onOpenSentiment?: () => void;
  sentimentHref?: string;
  onOpenDirectory?: () => void;
  directoryHref?: string;
  /** Shortcut tiles (Hiring Forms, …) as Mobile App → Shortcuts sets them. */
  shortcuts?: WelcomeShortcut[];
  onOpenHiring?: () => void;
  hiringHref?: string;
  onOpenTerms?: () => void;
  termsHref?: string;
  onLogout?: () => void;
  /** Simulator: open the venue picker in-frame. */
  onSwitchVenue?: () => void;
  switchVenueHref?: string;
  employeeHubLevel?: AccessMatrixLevel;
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
  onOpenConnect,
  connectHref,
  onOpenRevenue,
  revenueHref,
  onOpenSentiment,
  sentimentHref,
  onOpenDirectory,
  directoryHref,
  shortcuts = [],
  onOpenHiring,
  hiringHref,
  onOpenTerms,
  termsHref,
  onLogout,
  onSwitchVenue,
  switchVenueHref = `${MOBILE_APP_BASE}/select-venue`,
  employeeHubLevel = "viewer",
}: MobileWelcomeScreenProps) {
  const { beginNav } = useMobileNavBusy();
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;
  const hubTitle = venue.is_global
    ? "All Venues Operational HUB"
    : `${venue.name} Operational HUB`;
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  // Shortcuts sit at the end of the People row (they are not module tiles).
  const { mySections, hiddenSections, hiddenCount } = useMemo(() => {
    const categoryByKey = new Map(
      moduleCategories.map((category) => [category.key, category]),
    );
    const categories = WELCOME_CATEGORY_ORDER.map((key) =>
      categoryByKey.get(key),
    ).filter((category): category is NonNullable<typeof category> =>
      Boolean(category),
    );
    // Connecteam sits with the other apps (its tile shows the unread count).
    const visibleModules = modules;
    const hiddenModules = visibleModules.filter(isNoAccessModule);
    const myModules = visibleModules.filter((mod) => !isNoAccessModule(mod));

    const openShortcuts = shortcuts.filter((shortcut) => isShortcutOpen(shortcut.level));
    const lockedShortcuts = shortcuts.filter((shortcut) => !isShortcutOpen(shortcut.level));

    function groupByCategory(list: ModuleGridItem[], peopleShortcuts: WelcomeShortcut[]) {
      return categories
        .map((category) => {
          const sectionModules = list.filter(
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
          return {
            category,
            modules: sectionModules,
            shortcuts: category.key === "people" ? peopleShortcuts : [],
          };
        })
        .filter(
          (section) => section.modules.length > 0 || section.shortcuts.length > 0,
        );
    }

    return {
      mySections: groupByCategory(myModules, openShortcuts),
      hiddenSections: groupByCategory(hiddenModules, lockedShortcuts),
      hiddenCount: hiddenModules.length + lockedShortcuts.length,
    };
  }, [modules, shortcuts]);

  function shortcutOpener(key: string) {
    if (key === HIRING_SHORTCUT_KEY) return { href: hiringHref, onOpen: onOpenHiring };
    return { href: undefined, onOpen: undefined };
  }
  const [hiddenOpen, setHiddenOpen] = useState(false);

  function toggleApp(key: string) {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function renderModuleTile(mod: ModuleGridItem) {
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
          : live && mod.key === "team_connect"
            ? {
                href: connectHref,
                onOpen: onOpenConnect,
                noun: "Connecteam",
              }
            : null;
    const reservedToggle =
      mod.key === "sales" ||
      mod.key === "sentiment" ||
      mod.key === "directory" ||
      mod.key === "team_connect";
    return (
      <ModuleTile
        key={mod.key}
        label={mod.label}
        iconKey={mod.iconKey}
        status={mod.status}
        href={opensApp?.href}
        clickable={mod.clickable}
        blockedReason={mod.blockedReason}
        badgeCount={mod.badgeCount}
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
        locked={isNoAccessModule(mod)}
        topTag={isPhoneAppBuilt(mod.key) ? undefined : "Coming Soon"}
      />
    );
  }

  /** One flat grid (no category headings); order still follows the categories. */
  function renderAppGrid(sections: WelcomeSection[]) {
    return (
      <div className="grid grid-cols-4 items-start justify-items-center gap-x-1 gap-y-1.5">
        {sections.map((section) => (
          <Fragment key={section.category.key}>
            {section.modules.map((mod) => renderModuleTile(mod))}
            {section.shortcuts.map((shortcut) => {
              const open = isShortcutOpen(shortcut.level);
              const opener = shortcutOpener(shortcut.key);
              return (
                <ModuleTile
                  key={shortcut.key}
                  label={shortcut.label}
                  iconKey={shortcut.iconKey}
                  status="live"
                  href={open && !opener.onOpen ? opener.href : undefined}
                  clickable={open}
                  blockedReason={open ? undefined : "access"}
                  onSelect={open ? opener.onOpen : undefined}
                  comingSoonStyle="none"
                  selectNoun={shortcut.label}
                  iconWell
                  density="compact"
                  navigates={open}
                  locked={!open}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div
      className="mobile-app-canvas flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <header className="shrink-0 px-4 pb-2 pt-3 text-center">
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
          Choose the apps you want to start with.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1.25rem,var(--mobile-safe-bottom,0px))]">
        <div className="flex min-h-full flex-col gap-3">
        <div className="flex items-stretch gap-2">
          {employeeHubLevel !== "hidden" ? (
            <WelcomeProfileCard
              profile={profile}
              href={
                employeeHubLevel === "none"
                  ? undefined
                  : onOpenProfile
                    ? undefined
                    : profileHref
              }
              onOpen={employeeHubLevel === "none" ? undefined : onOpenProfile}
              locked={employeeHubLevel === "none"}
            />
          ) : null}
          <WelcomeNotificationsCard
            totalCount={notificationCount}
            href={onOpenNotifications ? undefined : notificationsHref}
            onOpen={onOpenNotifications}
          />
        </div>

        <section className="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/12 dark:bg-white/[0.08]">
          <h2 className="mb-2.5 px-1 font-serif text-sm font-semibold leading-none text-[#3D421F] dark:text-[CanvasText]">
            My apps
          </h2>
          {mySections.length > 0 ? (
            renderAppGrid(mySections)
          ) : (
            <p className="px-1 py-2 text-[13px] text-black/55 dark:text-white/55">
              No apps have been opened to you yet.
            </p>
          )}
        </section>

        {hiddenCount > 0 ? (
          <section className="rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/12 dark:bg-white/[0.05]">
            <button
              type="button"
              onClick={() => setHiddenOpen((open) => !open)}
              aria-expanded={hiddenOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <Lock
                className="h-3.5 w-3.5 text-black/45 dark:text-white/45"
                aria-hidden
              />
              <span className="font-serif text-sm font-semibold leading-none text-[#3D421F]/70 dark:text-[CanvasText]/70">
                Hidden
              </span>
              <span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[11px] font-medium tabular-nums leading-none text-black/55 dark:bg-white/10 dark:text-white/55">
                {hiddenCount}
              </span>
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 text-black/45 transition-transform dark:text-white/45",
                  hiddenOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            <AnimatePresence initial={false}>
              {hiddenOpen ? (
                <motion.div
                  key="hidden-apps"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-y-2.5 px-3 pb-3 opacity-80">
                    <p className="px-1 text-[11px] leading-snug text-black/55 dark:text-white/55">
                      You don&apos;t have access to these apps. Ask your manager
                      if you need one.
                    </p>
                    {renderAppGrid(hiddenSections)}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        ) : null}

        <div className="mt-auto space-y-2 pb-1">
          <div className="grid grid-cols-2 gap-2">
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
            {onSwitchVenue ? (
              <MobilePressTarget
                type="button"
                onClick={onSwitchVenue}
                className={LOGOUT_BUTTON_CLASS}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} />
                Switch venue
              </MobilePressTarget>
            ) : (
              <SwitchVenueLink href={switchVenueHref} />
            )}
          </div>
          <p className="text-center text-[11px] leading-[14px] text-black/60 dark:text-white/60">
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
    </div>
  );
}

function SwitchVenueLink({ href }: { href: string }) {
  const { pressed, pressProps } = useMobilePress();
  const { beginNav } = useMobileNavBusy();
  return (
    <motion.span
      className="block"
      animate={{ scale: pressed ? MOBILE_PRESS_SCALE : 1 }}
      transition={MOBILE_PRESS_TRANSITION}
      {...pressProps}
    >
      <Link href={href} className={LOGOUT_BUTTON_CLASS} onClick={() => beginNav()}>
        <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} />
        Switch venue
      </Link>
    </motion.span>
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
  icon: Icon = Bell,
  noun = "notification",
}: {
  totalCount: number;
  href?: string;
  onOpen?: () => void;
  /** Same card is reused for the Connecteam shortcut. */
  icon?: LucideIcon;
  noun?: string;
}) {
  const { pressed, pressProps } = useMobilePress();
  const { beginNav } = useMobileNavBusy();
  const count = totalCount > 99 ? "99+" : String(totalCount);
  const label = totalCount === 1 ? `1 ${noun}` : `${totalCount} ${noun}s`;

  const row = (
    <motion.span
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/15 bg-[var(--venue-primary,#818a40)]/15 ring-1 ring-black/5"
        animate={{ scale: pressed ? MOBILE_PRESS_SCALE : 1 }}
        transition={MOBILE_PRESS_TRANSITION}
    >
      <Icon className="h-5 w-5 text-[#3D421F]" strokeWidth={1.75} aria-hidden />
      {totalCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-semibold tabular-nums leading-none text-white shadow-[0_1px_2px_rgba(80,0,20,0.35)] ring-2 ring-white">
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
  locked = false,
}: {
  profile: MobileWelcomeProfile;
  href?: string;
  onOpen?: () => void;
  locked?: boolean;
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
        <p className="mt-0.5 truncate text-[11px] leading-snug text-black/60 dark:text-white/60">
          {locked ? "No access" : "Personal Employee Hub"}
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
    <section className="relative min-w-0 flex-1 rounded-xl border border-black/10 bg-black/[0.03] px-2.5 py-3 dark:border-white/12 dark:bg-white/[0.08]">
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
      {locked ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white">
          <Lock className="h-3 w-3" />
        </span>
      ) : null}
    </section>
  );
}
