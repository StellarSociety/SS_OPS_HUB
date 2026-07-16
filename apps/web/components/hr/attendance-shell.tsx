"use client";

import { ModulePageTitle } from "@/components/layout/module-page-title";
import { AttendanceSubNav } from "@/components/hr/attendance-sub-nav";

type AttendanceShellProps = {
  venueSubtitle: string;
  children: React.ReactNode;
};

export function AttendanceShell({
  venueSubtitle,
  children,
}: AttendanceShellProps) {
  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Attendance</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{venueSubtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>
      <AttendanceSubNav />
      {children}
    </div>
  );
}
