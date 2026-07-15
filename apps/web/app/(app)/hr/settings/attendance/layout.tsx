import { HrAttendanceSettingsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";

export default function HrAttendanceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Attendance</h2>
        <p className="mt-1 text-sm text-black/60">
          Working status and schedule labels used on the roster, attendance, and
          leave.
        </p>
      </div>
      <HrAttendanceSettingsSubNav />
      {children}
    </div>
  );
}
