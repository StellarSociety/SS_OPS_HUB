"use client";

import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock3,
  Flag,
  GraduationCap,
  Heart,
  ShieldCheck,
  Tags,
  UserCheck,
  VenusAndMars,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import {
  HR_SETTINGS_ATTENDANCE_HREF,
  HR_SETTINGS_NOTIFICATIONS_HREF,
  HR_SETTINGS_STAFF_DETAILS_HREF,
} from "@/lib/hr/settings-nav";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const STAFF_DETAILS_TABS: Tab[] = [
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/departments`,
    label: "Departments",
    icon: Building2,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/positions`,
    label: "Positions",
    icon: BriefcaseBusiness,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/employment-status`,
    label: "Employment Status",
    icon: UserCheck,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/nationalities`,
    label: "Nationalities",
    icon: Flag,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/civil-status`,
    label: "Civil Status",
    icon: Heart,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/gender`,
    label: "Gender",
    icon: VenusAndMars,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/insurance-categories`,
    label: "Insurance Categories",
    icon: ShieldCheck,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/certifications`,
    label: "Certifications",
    icon: GraduationCap,
  },
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/salary`,
    label: "Salary Defaults",
    icon: Wallet,
  },
];

const ATTENDANCE_TABS: Tab[] = [
  {
    href: `${HR_SETTINGS_ATTENDANCE_HREF}/working-status`,
    label: "Working Status",
    icon: Tags,
  },
  {
    href: `${HR_SETTINGS_ATTENDANCE_HREF}/schedule-labels`,
    label: "Schedule Labels",
    icon: CalendarDays,
  },
  {
    href: `${HR_SETTINGS_ATTENDANCE_HREF}/public-holidays`,
    label: "Public Holidays",
    icon: Flag,
  },
  {
    href: `${HR_SETTINGS_ATTENDANCE_HREF}/shift-templates`,
    label: "Shift Templates",
    icon: Clock3,
  },
  {
    href: `${HR_SETTINGS_ATTENDANCE_HREF}/shift-import-rules`,
    label: "Shift Import Rules",
    icon: CalendarClock,
  },
  {
    href: `${HR_SETTINGS_ATTENDANCE_HREF}/schedule-approval`,
    label: "Schedule Approval",
    icon: ShieldCheck,
  },
];

const NOTIFICATIONS_TABS: Tab[] = [
  {
    href: HR_SETTINGS_NOTIFICATIONS_HREF,
    label: "Channels & Roles",
    icon: Bell,
  },
  {
    href: `${HR_SETTINGS_NOTIFICATIONS_HREF}/expiry`,
    label: "Expiry & Reminders",
    icon: CalendarClock,
  },
];

function InnerSubNav({
  tabs,
  ariaLabel,
  exactHrefs = [],
}: {
  tabs: readonly Tab[];
  ariaLabel: string;
  exactHrefs?: readonly string[];
}) {
  const pathname = useRelativePathname();
  const exact = new Set(exactHrefs);

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
    >
      {tabs.map((tab) => {
        const active = exact.has(tab.href)
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <SubNavTab
            key={tab.href}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={active}
            variant="pill"
          />
        );
      })}
    </nav>
  );
}

export function HrStaffDetailsSubNav() {
  return (
    <InnerSubNav tabs={STAFF_DETAILS_TABS} ariaLabel="Staff details settings" />
  );
}

export function HrAttendanceSettingsSubNav() {
  return (
    <InnerSubNav tabs={ATTENDANCE_TABS} ariaLabel="Attendance settings" />
  );
}

export function HrNotificationsSettingsSubNav() {
  return (
    <InnerSubNav
      tabs={NOTIFICATIONS_TABS}
      ariaLabel="Notification settings"
      exactHrefs={[HR_SETTINGS_NOTIFICATIONS_HREF]}
    />
  );
}
