import { HrStaffDetailsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";

export default function HrStaffDetailsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Staff Details</h2>
        <p className="mt-1 text-sm text-black/60">
          Profile lookups and salary defaults used across the staff directory,
          insurance, and training.
        </p>
      </div>
      <HrStaffDetailsSubNav />
      {children}
    </div>
  );
}
