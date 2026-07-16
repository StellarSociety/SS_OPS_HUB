"use client";

import { ModulePageTitle } from "@/components/layout/module-page-title";
import { AttendanceSubNav } from "@/components/hr/attendance-sub-nav";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";

type AttendanceShellProps = {
  venueSubtitle: string;
  children: React.ReactNode;
};

export function AttendanceShell({
  venueSubtitle,
  children,
}: AttendanceShellProps) {
  const pathname = useRelativePathname();
  const isLeaveModule = pathname.startsWith("/hr/attendance/leave");

  if (isLeaveModule) {
    return <>{children}</>;
  }

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
