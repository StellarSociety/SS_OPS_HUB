"use client";

import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Clock3,
  Flag,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  ListTree,
  Percent,
  Settings2,
  ShieldCheck,
  Tags,
  UserCheck,
  UserRound,
  Users,
  VenusAndMars,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import {
  HR_SETTINGS_ATTENDANCE_ATTENDANCE_HREF,
  HR_SETTINGS_ATTENDANCE_HREF,
  HR_SETTINGS_ATTENDANCE_LEAVE_HREF,
  HR_SETTINGS_ATTENDANCE_SCHEDULES_HREF,
  HR_SETTINGS_NOTIFICATIONS_HREF,
  HR_SETTINGS_PAY_ADJUSTMENTS_HREF,
  HR_SETTINGS_PAY_BENEFITS_GRATUITY_HREF,
  HR_SETTINGS_PAY_BENEFITS_HREF,
  HR_SETTINGS_PAY_BENEFITS_SERVICE_CHARGE_HREF,
  HR_SETTINGS_PAY_HREF,
  HR_SETTINGS_STAFF_DETAILS_HREF,
} from "@/lib/hr/settings-nav";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type AttendanceCategory = "schedules" | "attendance" | "leave";

type StaffDetailsCategory =
  | "directory"
  | "personal"
  | "insurance"
  | "training";

const STAFF_DIRECTORY_TABS: Tab[] = [
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
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/salary`,
    label: "Salary Defaults",
    icon: Wallet,
  },
];

const STAFF_PERSONAL_TABS: Tab[] = [
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
];

const STAFF_INSURANCE_TABS: Tab[] = [
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/insurance-categories`,
    label: "Insurance Categories",
    icon: ShieldCheck,
  },
];

const STAFF_TRAINING_TABS: Tab[] = [
  {
    href: `${HR_SETTINGS_STAFF_DETAILS_HREF}/certifications`,
    label: "Certifications",
    icon: GraduationCap,
  },
];

const STAFF_DETAILS_CATEGORY_TABS: Array<
  Tab & { key: StaffDetailsCategory; matchHrefs: readonly string[] }
> = [
  {
    key: "directory",
    href: STAFF_DIRECTORY_TABS[0]!.href,
    label: "Staff Directory",
    icon: Users,
    matchHrefs: STAFF_DIRECTORY_TABS.map((tab) => tab.href),
  },
  {
    key: "personal",
    href: STAFF_PERSONAL_TABS[0]!.href,
    label: "Staff Personal Details",
    icon: UserRound,
    matchHrefs: STAFF_PERSONAL_TABS.map((tab) => tab.href),
  },
  {
    key: "insurance",
    href: STAFF_INSURANCE_TABS[0]!.href,
    label: "Insurance",
    icon: ShieldCheck,
    matchHrefs: STAFF_INSURANCE_TABS.map((tab) => tab.href),
  },
  {
    key: "training",
    href: STAFF_TRAINING_TABS[0]!.href,
    label: "Training",
    icon: GraduationCap,
    matchHrefs: STAFF_TRAINING_TABS.map((tab) => tab.href),
  },
];

const STAFF_PAGE_TABS_BY_CATEGORY: Record<
  StaffDetailsCategory,
  readonly Tab[]
> = {
  directory: STAFF_DIRECTORY_TABS,
  personal: STAFF_PERSONAL_TABS,
  insurance: STAFF_INSURANCE_TABS,
  training: STAFF_TRAINING_TABS,
};

const SCHEDULES_PAGE_TABS: Tab[] = [
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

const ATTENDANCE_PAGE_TABS: Tab[] = [
  {
    href: `${HR_SETTINGS_ATTENDANCE_HREF}/public-holidays`,
    label: "Public Holidays",
    icon: Flag,
  },
];

const ATTENDANCE_CATEGORY_TABS: Array<
  Tab & { key: AttendanceCategory; matchHrefs: readonly string[] }
> = [
  {
    key: "schedules",
    href: HR_SETTINGS_ATTENDANCE_SCHEDULES_HREF,
    label: "Schedules",
    icon: CalendarDays,
    matchHrefs: SCHEDULES_PAGE_TABS.map((tab) => tab.href),
  },
  {
    key: "attendance",
    href: HR_SETTINGS_ATTENDANCE_ATTENDANCE_HREF,
    label: "Attendance",
    icon: CalendarCheck,
    matchHrefs: ATTENDANCE_PAGE_TABS.map((tab) => tab.href),
  },
  {
    key: "leave",
    href: HR_SETTINGS_ATTENDANCE_LEAVE_HREF,
    label: "Leave",
    icon: CalendarOff,
    matchHrefs: [HR_SETTINGS_ATTENDANCE_LEAVE_HREF],
  },
];

const PAGE_TABS_BY_CATEGORY: Record<AttendanceCategory, readonly Tab[]> = {
  schedules: SCHEDULES_PAGE_TABS,
  attendance: ATTENDANCE_PAGE_TABS,
  leave: [],
};

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

const PAY_CATEGORY_TABS: Tab[] = [
  {
    href: HR_SETTINGS_PAY_HREF,
    label: "Period & Payment",
    icon: Settings2,
  },
  {
    href: HR_SETTINGS_PAY_ADJUSTMENTS_HREF,
    label: "Adjustments & Codes",
    icon: ListTree,
  },
  {
    href: HR_SETTINGS_PAY_BENEFITS_HREF,
    label: "Benefits",
    icon: Gift,
  },
];

const PAY_BENEFITS_TABS: Tab[] = [
  {
    href: HR_SETTINGS_PAY_BENEFITS_GRATUITY_HREF,
    label: "Gratuity",
    icon: HandCoins,
  },
  {
    href: HR_SETTINGS_PAY_BENEFITS_SERVICE_CHARGE_HREF,
    label: "Service Charge",
    icon: Percent,
  },
];

function pathMatchesTab(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
        const active = pathMatchesTab(pathname, tab.href, exact.has(tab.href));

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
  const pathname = useRelativePathname();

  const activeCategory =
    STAFF_DETAILS_CATEGORY_TABS.find((tab) =>
      tab.matchHrefs.some((href) => pathMatchesTab(pathname, href)),
    )?.key ?? "directory";

  const pageTabs = STAFF_PAGE_TABS_BY_CATEGORY[activeCategory];

  return (
    <div className="space-y-3">
      <nav
        aria-label="Staff details settings categories"
        className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
      >
        {STAFF_DETAILS_CATEGORY_TABS.map((tab) => (
          <SubNavTab
            key={tab.key}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={tab.key === activeCategory}
            variant="pill"
          />
        ))}
      </nav>
      {pageTabs.length > 1 ? (
        <InnerSubNav
          tabs={pageTabs}
          ariaLabel={`${activeCategory} settings`}
        />
      ) : null}
    </div>
  );
}

export function HrAttendanceSettingsSubNav() {
  const pathname = useRelativePathname();

  const activeCategory =
    ATTENDANCE_CATEGORY_TABS.find((tab) =>
      tab.matchHrefs.some((href) => pathMatchesTab(pathname, href)),
    )?.key ?? "schedules";

  const pageTabs = PAGE_TABS_BY_CATEGORY[activeCategory];

  return (
    <div className="space-y-3">
      <nav
        aria-label="Attendance settings categories"
        className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
      >
        {ATTENDANCE_CATEGORY_TABS.map((tab) => (
          <SubNavTab
            key={tab.key}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={tab.key === activeCategory}
            variant="pill"
          />
        ))}
      </nav>
      {pageTabs.length > 0 ? (
        <InnerSubNav
          tabs={pageTabs}
          ariaLabel={`${activeCategory} settings`}
        />
      ) : null}
    </div>
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

export function HrPaySettingsSubNav() {
  const pathname = useRelativePathname();
  const onBenefits = pathMatchesTab(pathname, HR_SETTINGS_PAY_BENEFITS_HREF);

  return (
    <div className="space-y-3">
      <InnerSubNav
        tabs={PAY_CATEGORY_TABS}
        ariaLabel="Pay settings"
        exactHrefs={[HR_SETTINGS_PAY_HREF]}
      />
      {onBenefits ? (
        <InnerSubNav tabs={PAY_BENEFITS_TABS} ariaLabel="Benefits settings" />
      ) : null}
    </div>
  );
}
