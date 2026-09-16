"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Mail, Package, Route, ShieldAlert, Shirt } from "lucide-react";
import { StatusBadge } from "@/components/hr/status-badge";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { MobileAssetTermsScreen } from "@/components/mobile/mobile-asset-terms-screen";
import { MobileProfileToggle } from "@/components/mobile/mobile-profile-toggle";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";
import { formatDisplayDate } from "@/lib/dates/display";
import type {
  MobileProfileAssetTerms,
  MobileWelcomeProfile,
} from "@/lib/mobile/welcome-profile";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/lib/user/display";
import type { Venue } from "@/lib/types/database";

type MobileEmployeeProfileScreenProps = {
  venue: Venue;
  profile: MobileWelcomeProfile;
  onSelectTab?: (tab: MobileTabItem) => void;
};

function dash(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function formatDate(value: string | null | undefined): string {
  const iso = value?.trim().slice(0, 10) ?? "";
  if (!iso) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDisplayDate(iso) : iso;
}

export function MobileEmployeeProfileScreen({
  venue,
  profile,
  onSelectTab,
}: MobileEmployeeProfileScreenProps) {
  const { beginNav } = useMobileNavBusy();
  const [assetTerms, setAssetTerms] = useState(profile.assetTerms);
  const [showAssetTerms, setShowAssetTerms] = useState(false);
  const displayName = profile.fullName?.trim() || profile.email || "Profile";
  const initials = getUserInitials(profile.fullName, profile.email);
  const countryValue =
    profile.country || profile.countryFlag
      ? [profile.countryFlag, profile.country].filter(Boolean).join(" ")
      : null;

  useEffect(() => {
    setAssetTerms(profile.assetTerms);
  }, [profile.assetTerms]);

  if (showAssetTerms && assetTerms) {
    return (
      <MobileAssetTermsScreen
        venue={venue}
        profile={profile}
        terms={assetTerms}
        onBack={() => setShowAssetTerms(false)}
        onSubmitted={setAssetTerms}
      />
    );
  }

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
          Employee Profile
        </h1>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        <div className="mt-5 flex flex-col items-center gap-3">
          {profile.avatarUrl ? (
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10">
              <Image
                src={profile.avatarUrl}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#3D421F] text-3xl font-medium text-white">
              {initials}
            </div>
          )}
          <p className="font-serif text-xl text-[#3D421F] dark:text-[CanvasText]">{displayName}</p>
        </div>

        <div className="mt-6 space-y-4">
          <ProfileCard>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <ProfileField
                className="col-span-2"
                label="Employee number"
                value={dash(profile.empNo)}
              />
              <ProfileField label="Department" value={dash(profile.department)} />
              <ProfileField label="Position" value={dash(profile.position)} />
            </div>
            <hr className="my-3 border-black/10 dark:border-white/12" />
            <div className="grid grid-cols-2 gap-x-4">
              <ProfileField
                label="Employment duration"
                value={dash(profile.employmentDuration)}
              />
              <ProfileField label="Work time" value={dash(profile.workTime)} />
            </div>
            <hr className="my-3 border-black/10 dark:border-white/12" />
            <div className="grid grid-cols-2 gap-x-4">
              <div>
                <dt className="text-xs text-black/40 dark:text-white/40">
                  Employment status
                </dt>
                <dd className="mt-1">
                  <StatusBadge status={profile.employmentStatus} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-black/40 dark:text-white/40">
                  Working status
                </dt>
                <dd className="mt-1">
                  {profile.workingStatus ? (
                    <WorkingStatusBadge status={profile.workingStatus} />
                  ) : (
                    <span className="text-[#3D421F] dark:text-[CanvasText]">—</span>
                  )}
                </dd>
              </div>
            </div>
          </ProfileCard>

          <ProfileCard>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <ProfileField
                label="Joining date"
                value={formatDate(profile.joiningDate)}
              />
              <ProfileField
                label="Contract type"
                value={dash(profile.contractType)}
              />
              <div className="col-span-2">
                <dt className="text-xs text-black/40 dark:text-white/40">
                  Probation period
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  {profile.probationStatus ? (
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        probationStatusClass(profile.probationStatus),
                      )}
                    >
                      {profile.probationStatus}
                    </span>
                  ) : null}
                  {profile.probationPeriod ? (
                    <span className="font-medium text-[#3D421F] dark:text-[CanvasText]">
                      {profile.probationPeriod}
                    </span>
                  ) : profile.probationStatus ? null : (
                    <span className="font-medium text-[#3D421F] dark:text-[CanvasText]">
                      —
                    </span>
                  )}
                </dd>
              </div>
              <ProfileField
                label="Payable salary"
                value={dash(profile.payableSalary)}
              />
              <ProfileField
                label="Accommodation"
                value={dash(profile.accommodation)}
              />
            </div>
          </ProfileCard>

          <ProfileCard>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <ProfileField
                className="col-span-2"
                label="Full name"
                value={dash(profile.fullName)}
              />
              <ProfileField label="Country" value={dash(countryValue)} />
              <ProfileField label="DOB" value={formatDate(profile.dob)} />
              <ProfileField label="Gender" value={dash(profile.gender)} />
              <ProfileField label="Civil status" value={dash(profile.civilStatus)} />
              <ProfileField label="Phone" value={dash(profile.phone)} />
              <ProfileField label="WhatsApp" value={dash(profile.whatsapp)} />
              <ProfileField
                className="col-span-2 min-w-0"
                label="Personal email"
                value={dash(profile.personalEmail)}
                valueClassName="break-all"
              />
              <ProfileField
                className="col-span-2 min-w-0"
                label="Work email"
                value={dash(profile.workEmail)}
                valueClassName="break-all"
              />
            </div>
          </ProfileCard>

          <div className="px-1 text-[11px] leading-relaxed text-black/40 dark:text-white/40">
            <p>If any of these values are not matching, please contact HR to rectify them.</p>
            {profile.hrEmail ? (
              <a
                href={`mailto:${profile.hrEmail}?subject=${encodeURIComponent("Profile details correction")}`}
                className="mt-1.5 inline-flex items-center gap-0.5 rounded border border-black/12 bg-black/[0.04] px-1.5 py-px text-[11px] font-semibold leading-none text-[#3D421F] dark:border-white/15 dark:bg-white/[0.08] dark:text-[CanvasText]"
              >
                <Mail className="h-3 w-3" strokeWidth={2} aria-hidden />
                HR
              </a>
            ) : null}
          </div>

          <div className="space-y-2">
            <MobileProfileToggle
              title="Employment Path"
              icon={Route}
              count={(profile.pathEvents ?? []).length}
            >
              {(profile.pathEvents ?? []).length === 0 ? (
                <p className="text-sm text-black/45 dark:text-white/45">
                  No path events yet.
                </p>
              ) : (
                <ul className="relative ml-1.5 space-y-3 border-l border-black/10 dark:border-white/12">
                  {profile.pathEvents.map((event) => (
                    <li key={event.id} className="relative pl-5">
                      <span
                        className="absolute left-0 top-2 size-2 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--venue-primary,#818a40)] shadow-sm ring-1 ring-black/10"
                        aria-hidden
                      />
                      <p className="text-xs tabular-nums text-black/45 dark:text-white/45">
                        {formatDate(event.date)}
                      </p>
                      <p className="mt-0.5 font-medium text-[#3D421F] dark:text-[CanvasText]">
                        {event.title}
                      </p>
                      {(event.lines ?? []).map((line, index) => (
                        <p
                          key={`${event.id}-${index}`}
                          className="mt-0.5 text-xs text-black/55 dark:text-white/55"
                        >
                          {line}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </MobileProfileToggle>

            <MobileProfileToggle
              title="Disciplinary Actions"
              icon={ShieldAlert}
              count={(profile.disciplinaryActions ?? []).length}
            >
              {(profile.disciplinaryActions ?? []).length === 0 ? (
                <p className="text-sm text-black/45 dark:text-white/45">
                  No actions recorded yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {profile.disciplinaryActions.map((action) => (
                    <li key={action.id}>
                      <p className="text-xs tabular-nums text-black/45 dark:text-white/45">
                        {formatDate(action.date)}
                      </p>
                      <p className="mt-0.5 font-medium text-[#3D421F] dark:text-[CanvasText]">
                        {action.title}
                      </p>
                      {action.detail ? (
                        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                          {action.detail}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </MobileProfileToggle>

            <MobileProfileToggle
              title="Uniform Details"
              icon={Shirt}
              count={(profile.uniforms ?? []).length}
            >
              {(profile.uniforms ?? []).length === 0 ? (
                <p className="text-sm text-black/45 dark:text-white/45">
                  No uniform pieces currently assigned.
                </p>
              ) : (
                <ul className="space-y-3">
                  {profile.uniforms.map((item) => (
                    <li key={item.id}>
                      <p className="font-medium text-[#3D421F] dark:text-[CanvasText]">
                        {item.name}
                        {item.quantity > 1 ? (
                          <span className="ml-1.5 text-xs font-normal text-black/45 dark:text-white/45">
                            ×{item.quantity}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">
                        Provided {formatDate(item.providedAt)}
                      </p>
                      {item.notes ? (
                        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                          {item.notes}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </MobileProfileToggle>

            <MobileProfileToggle
              title="Assets Details"
              icon={Package}
              count={(profile.assets ?? []).length}
            >
              {(profile.assets ?? []).length === 0 ? (
                <p className="text-sm text-black/45 dark:text-white/45">
                  No company assets currently assigned.
                </p>
              ) : (
                <ul className="space-y-3">
                  {profile.assets.map((asset) => (
                    <li key={asset.id}>
                      <p className="font-medium text-[#3D421F] dark:text-[CanvasText]">
                        {asset.name}
                      </p>
                      {asset.type ? (
                        <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">
                          Type {asset.type}
                        </p>
                      ) : null}
                      {asset.serial ? (
                        <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">
                          Serial {asset.serial}
                        </p>
                      ) : null}
                      {asset.value ? (
                        <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">
                          Value {asset.value}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">
                        {asset.status} · issued {formatDate(asset.assignedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <AssetTermsCta
                terms={assetTerms}
                onAccept={() => {
                  beginNav();
                  setShowAssetTerms(true);
                }}
              />
            </MobileProfileToggle>
          </div>
        </div>
      </div>

      <MobileTabBar
        app="profile"
        activeId="profile"
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}

function AssetTermsCta({
  terms,
  onAccept,
}: {
  terms: MobileProfileAssetTerms | null | undefined;
  onAccept: () => void;
}) {
  if (!terms) return null;

  if (terms.status === "acknowledged") {
    return (
      <p className="mt-1 text-xs text-black/45 dark:text-white/45">
        {`Asset T&Cs accepted${
          terms.respondedAt
            ? ` on ${formatDate(terms.respondedAt.slice(0, 10))}`
            : ""
        }.`}
      </p>
    );
  }

  if (terms.status === "not_acknowledged") {
    return (
      <p className="mt-1 text-xs text-black/45 dark:text-white/45">
        Asset T&Cs were not accepted. Please contact HR.
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      <p className="text-xs text-black/45 dark:text-white/45">
        HR sent asset T&Cs
        {terms.sentAt ? ` on ${formatDate(terms.sentAt.slice(0, 10))}` : ""}.
        Please read and accept them.
      </p>
      <button
        type="button"
        onClick={onAccept}
        className="flex h-10 w-full items-center justify-center rounded-xl bg-[var(--venue-primary,#818a40)] text-sm font-semibold text-white"
      >
        Accept T&Cs
      </button>
    </div>
  );
}

function ProfileCard({ children }: { children: ReactNode }) {
  return (
    <dl className="rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm dark:border-white/12 dark:bg-white/[0.08]">
      {children}
    </dl>
  );
}

function ProfileField({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-black/40 dark:text-white/40">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-medium text-[#3D421F] dark:text-[CanvasText]",
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function probationStatusClass(status: string): string {
  const key = status.trim().toLowerCase();
  if (key === "pending") return "border-amber-200 bg-amber-50 text-amber-800";
  if (key === "expired") return "border-red-200 bg-red-50 text-red-800";
  if (key === "confirmed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (key === "terminated") return "border-neutral-200 bg-neutral-100 text-neutral-700";
  return "border-black/10 bg-black/10 text-black/70";
}
