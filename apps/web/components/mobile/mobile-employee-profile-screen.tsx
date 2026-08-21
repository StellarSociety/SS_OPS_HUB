"use client";

import Image from "next/image";
import { type CSSProperties } from "react";
import { StatusBadge } from "@/components/hr/status-badge";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import type { MobileWelcomeProfile } from "@/lib/mobile/welcome-profile";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
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

export function MobileEmployeeProfileScreen({
  venue,
  profile,
  onSelectTab,
}: MobileEmployeeProfileScreenProps) {
  const displayName = profile.fullName?.trim() || profile.email || "Profile";
  const initials = getUserInitials(profile.fullName, profile.email);

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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-14">
        <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
          Employee Profile
        </h1>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        <div className="mt-5 flex flex-col items-center gap-3">
          {profile.avatarUrl ? (
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10">
              <Image
                src={profile.avatarUrl}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#3D421F] text-3xl font-medium text-white">
              {initials}
            </div>
          )}
          <p className="font-serif text-xl text-[#3D421F] dark:text-[CanvasText]">{displayName}</p>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm dark:border-white/12 dark:bg-white/[0.08]">
          <ProfileField label="Employee number" value={dash(profile.empNo)} />
          <ProfileField label="Department" value={dash(profile.department)} />
          <ProfileField label="Position" value={dash(profile.position)} />
          <ProfileField
            label="Employment duration"
            value={dash(profile.employmentDuration)}
          />
          <ProfileField label="Work time" value={dash(profile.workTime)} />
          <div>
            <dt className="text-xs text-black/40 dark:text-white/40">Employment status</dt>
            <dd className="mt-1">
              <StatusBadge status={profile.employmentStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-black/40 dark:text-white/40">Working status</dt>
            <dd className="mt-1">
              {profile.workingStatus ? (
                <WorkingStatusBadge status={profile.workingStatus} />
              ) : (
                <span className="text-[#3D421F] dark:text-[CanvasText]">—</span>
              )}
            </dd>
          </div>
        </dl>
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

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-black/40 dark:text-white/40">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#3D421F] dark:text-[CanvasText]">{value}</dd>
    </div>
  );
}
