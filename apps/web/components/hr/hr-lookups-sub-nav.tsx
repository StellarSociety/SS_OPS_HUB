"use client";

import {
  BriefcaseBusiness,
  Building2,
  Flag,
  GraduationCap,
  Heart,
  ShieldCheck,
  UserCheck,
  VenusAndMars,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const tabs = [
  { href: "/hr/settings/lookups/departments", label: "Departments", icon: Building2 },
  { href: "/hr/settings/lookups/positions", label: "Positions", icon: BriefcaseBusiness },
  {
    href: "/hr/settings/lookups/employment-status",
    label: "Employment Status",
    icon: UserCheck,
  },
  { href: "/hr/settings/lookups/nationalities", label: "Nationalities", icon: Flag },
  { href: "/hr/settings/lookups/civil-status", label: "Civil Status", icon: Heart },
  { href: "/hr/settings/lookups/gender", label: "Gender", icon: VenusAndMars },
  {
    href: "/hr/settings/lookups/insurance-categories",
    label: "Insurance Categories",
    icon: ShieldCheck,
  },
  {
    href: "/hr/settings/lookups/certifications",
    label: "Certifications",
    icon: GraduationCap,
  },
] as const;

export function HrLookupsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="HR lookup types"
      className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5"
    >
      {tabs.map((tab) => (
        <SubNavTab
          key={tab.href}
          href={tab.href}
          label={tab.label}
          icon={tab.icon}
          active={pathname.startsWith(tab.href)}
          variant="pill"
        />
      ))}
    </nav>
  );
}
