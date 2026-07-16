import { HrDataManagementSubNav } from "@/components/hr/hr-data-management-sub-nav";

export default function HrDataManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Data Management</h2>
        <p className="mt-1 text-sm text-black/60">
          Bulk import and export employee and attendance data via Excel
          templates.
        </p>
      </div>
      <HrDataManagementSubNav />
      {children}
    </div>
  );
}
